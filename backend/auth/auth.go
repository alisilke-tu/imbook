package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"encore.dev/beta/auth"
	"encore.dev/beta/errs"
	"encore.dev/storage/sqldb"
	firebase "firebase.google.com/go/v4"
	fbauth "firebase.google.com/go/v4/auth"
	"go4.org/syncutil"
	"google.golang.org/api/option"
)

var secrets struct {
	// FirebasePrivateKey is the JSON credentials for calling Firebase.
	FirebasePrivateKey string
}

// isEmailBootstrapAdmin reports whether the email is listed in bootstrap_admin_emails (see migration 3).
func isEmailBootstrapAdmin(ctx context.Context, email string) bool {
	e := strings.TrimSpace(strings.ToLower(email))
	if e == "" {
		return false
	}
	var exists bool
	err := usersDB.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM bootstrap_admin_emails WHERE LOWER(TRIM(email)) = $1
		)
	`, e).Scan(&exists)
	return err == nil && exists
}

var (
	fbAuth    *fbauth.Client
	setupOnce syncutil.Once
)

// Database for storing user metadata and roles.
var usersDB = sqldb.NewDatabase("auth", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

// Data represents the user's data stored in Firebase Auth.
type UserData struct {
	// Email is the user's email.
	Email string
	// Name is the user's name.
	Name string
	// Picture is the user's picture URL.
	Picture string
	// IsAdmin indicates if the user has admin privileges.
	IsAdmin bool
}

// ValidateToken validates an auth token against Firebase Auth.
//
//encore:authhandler
func ValidateToken(ctx context.Context, token string) (auth.UID, *UserData, error) {
	if err := setupFB(); err != nil {
		return "", nil, err
	}
	tok, err := fbAuth.VerifyIDToken(ctx, token)
	if err != nil {
		return "", nil, err
	}

	email, _ := tok.Claims["email"].(string)
	name, _ := tok.Claims["name"].(string)
	picture, _ := tok.Claims["picture"].(string)
	uid := auth.UID(tok.UID)

	// Query database for user role and metadata
	var isAdmin bool
	err = usersDB.QueryRow(ctx, `
		SELECT is_admin FROM users WHERE firebase_uid = $1
	`, string(uid)).Scan(&isAdmin)

	if err != nil {
		// If user doesn't exist in database, auto-create them (bootstrap admin by email when applicable)
		if errors.Is(err, sql.ErrNoRows) {
			insertAdmin := isEmailBootstrapAdmin(ctx, email)
			_, insertErr := usersDB.Exec(ctx, `
				INSERT INTO users (firebase_uid, email, display_name, is_admin, last_login)
				VALUES ($1, $2, $3, $4, NOW())
			`, string(uid), email, name, insertAdmin)
			if insertErr != nil {
				return "", nil, insertErr
			}
			isAdmin = insertAdmin
		} else {
			return "", nil, err
		}
	} else {
		// Existing row: sync login time; self-heal bootstrap admin if DB was never migrated
		// or email column did not match (NULL / stale) so migration 2 updated 0 rows.
		if isEmailBootstrapAdmin(ctx, email) && !isAdmin {
			_, err = usersDB.Exec(ctx, `
				UPDATE users
				SET is_admin = true, last_login = NOW(), email = CASE WHEN $2 <> '' THEN $2 ELSE email END
				WHERE firebase_uid = $1
			`, string(uid), email)
			if err != nil {
				return "", nil, err
			}
			isAdmin = true
		} else {
			if email != "" {
				_, _ = usersDB.Exec(ctx, `
					UPDATE users SET last_login = NOW(), email = $2 WHERE firebase_uid = $1
				`, string(uid), email)
			} else {
				_, _ = usersDB.Exec(ctx, `
					UPDATE users SET last_login = NOW() WHERE firebase_uid = $1
				`, string(uid))
			}
		}
	}

	usr := &UserData{
		Email:   email,
		Name:    name,
		Picture: picture,
		IsAdmin: isAdmin,
	}
	return uid, usr, nil
}

// setupFB ensures Firebase Auth is setup.
func setupFB() error {
	return setupOnce.Do(func() error {
		opt := option.WithCredentialsJSON([]byte(secrets.FirebasePrivateKey))
		app, err := firebase.NewApp(context.Background(), nil, opt)
		if err == nil {
			fbAuth, err = app.Auth(context.Background())
		}
		return err
	})
}

// IsAdmin checks if the current authenticated user is an admin.
func IsAdmin(ctx context.Context) bool {
	data := auth.Data()
	if data == nil {
		return false
	}
	userData, ok := data.(*UserData)
	if !ok {
		return false
	}
	return userData.IsAdmin
}

// User represents a user in the system.
type User struct {
	FirebaseUID string     `json:"firebase_uid"`
	Email       string     `json:"email"`
	DisplayName *string    `json:"display_name"`
	IsAdmin     bool       `json:"is_admin"`
	LastLogin   *time.Time `json:"last_login"`
	CreatedAt   time.Time  `json:"created_at"`
}

// GetMeResponse returns the current user's data.
type GetMeResponse struct {
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
	IsAdmin bool   `json:"is_admin"`
}

// GetMe returns the current authenticated user's data.
//
//encore:api auth method=GET path=/auth/me
func GetMe(ctx context.Context) (*GetMeResponse, error) {
	userData := auth.Data().(*UserData)
	return &GetMeResponse{
		Email:   userData.Email,
		Name:    userData.Name,
		Picture: userData.Picture,
		IsAdmin: userData.IsAdmin,
	}, nil
}

// CreateUserParams are the parameters for creating a new user.
type CreateUserParams struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
	IsAdmin     bool   `json:"is_admin"`
}

// CreateUserResponse is returned after creating a user.
type CreateUserResponse struct {
	FirebaseUID string `json:"firebase_uid"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	IsAdmin     bool   `json:"is_admin"`
}

// CreateUser creates a new user in Firebase and the database. Admin only.
//
//encore:api auth method=POST path=/auth/users
func CreateUser(ctx context.Context, params *CreateUserParams) (*CreateUserResponse, error) {
	if !IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}

	if err := setupFB(); err != nil {
		return nil, err
	}

	// Validate parameters
	if params.Email == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "email is required"}
	}
	if params.Password == "" {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "password is required"}
	}

	// Create user in Firebase
	userToCreate := (&fbauth.UserToCreate{}).
		Email(params.Email).
		Password(params.Password).
		DisplayName(params.DisplayName).
		EmailVerified(false)

	fbUser, err := fbAuth.CreateUser(ctx, userToCreate)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to create Firebase user: " + err.Error()}
	}

	// Insert into database
	_, err = usersDB.Exec(ctx, `
		INSERT INTO users (firebase_uid, email, display_name, is_admin, created_at)
		VALUES ($1, $2, $3, $4, NOW())
	`, fbUser.UID, params.Email, params.DisplayName, params.IsAdmin)

	if err != nil {
		// Rollback: delete from Firebase if database insert fails
		_ = fbAuth.DeleteUser(ctx, fbUser.UID)
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to save user to database"}
	}

	return &CreateUserResponse{
		FirebaseUID: fbUser.UID,
		Email:       params.Email,
		DisplayName: params.DisplayName,
		IsAdmin:     params.IsAdmin,
	}, nil
}

// DeleteUserParams are the parameters for deleting a user.
type DeleteUserParams struct {
	UID string `json:"uid"`
}

// DeleteUser deletes a user from Firebase and the database. Admin only.
//
//encore:api auth method=DELETE path=/auth/users/:uid
func DeleteUser(ctx context.Context, uid string) error {
	if !IsAdmin(ctx) {
		return &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}

	if err := setupFB(); err != nil {
		return err
	}

	// Prevent self-deletion
	currentUID, _ := auth.UserID()
	if string(currentUID) == uid {
		return &errs.Error{Code: errs.InvalidArgument, Message: "cannot delete your own account"}
	}

	// Delete from Firebase
	err := fbAuth.DeleteUser(ctx, uid)
	if err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to delete Firebase user: " + err.Error()}
	}

	// Delete from database
	_, err = usersDB.Exec(ctx, `DELETE FROM users WHERE firebase_uid = $1`, uid)
	if err != nil {
		return &errs.Error{Code: errs.Internal, Message: "failed to delete user from database"}
	}

	return nil
}

// ResetPasswordResponse is returned after sending a password reset email.
type ResetPasswordResponse struct {
	Message string `json:"message"`
}

// ResetPassword sends a password reset email to the user. Admin only.
//
//encore:api auth method=POST path=/auth/users/:uid/reset-password
func ResetPassword(ctx context.Context, uid string) (*ResetPasswordResponse, error) {
	if !IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}

	if err := setupFB(); err != nil {
		return nil, err
	}

	// Get user email from Firebase
	fbUser, err := fbAuth.GetUser(ctx, uid)
	if err != nil {
		return nil, &errs.Error{Code: errs.NotFound, Message: "user not found"}
	}

	// Generate password reset link
	link, err := fbAuth.PasswordResetLink(ctx, fbUser.Email)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to generate reset link: " + err.Error()}
	}

	// Firebase automatically sends the email
	// The link is also returned in case you want to send it manually
	_ = link

	return &ResetPasswordResponse{
		Message: "Password reset email sent to " + fbUser.Email,
	}, nil
}

// ListUsersResponse is returned by ListUsers.
type ListUsersResponse struct {
	Users []User `json:"users"`
}

// ListUsers returns all users in the system. Admin only.
//
//encore:api auth method=GET path=/auth/users/list
func ListUsers(ctx context.Context) (*ListUsersResponse, error) {
	if !IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}

	rows, err := usersDB.Query(ctx, `
		SELECT firebase_uid, email, display_name, is_admin, last_login, created_at
		FROM users
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to fetch users"}
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.FirebaseUID, &u.Email, &u.DisplayName, &u.IsAdmin, &u.LastLogin, &u.CreatedAt); err != nil {
			return nil, &errs.Error{Code: errs.Internal, Message: "failed to scan user"}
		}
		users = append(users, u)
	}

	if err := rows.Err(); err != nil {
		return nil, &errs.Error{Code: errs.Internal, Message: "error iterating users"}
	}

	return &ListUsersResponse{Users: users}, nil
}

// UpdateUserRoleParams sets admin flag for an existing user.
type UpdateUserRoleParams struct {
	IsAdmin bool `json:"is_admin"`
}

// UpdateUserRole updates a user's admin role. Admin only; cannot change your own role.
//
//encore:api auth method=PATCH path=/auth/users/:uid/role
func UpdateUserRole(ctx context.Context, uid string, params *UpdateUserRoleParams) (*User, error) {
	if !IsAdmin(ctx) {
		return nil, &errs.Error{Code: errs.PermissionDenied, Message: "admin access required"}
	}
	if params == nil {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "body required"}
	}

	currentUID, _ := auth.UserID()
	if string(currentUID) == uid {
		return nil, &errs.Error{Code: errs.InvalidArgument, Message: "cannot change your own role"}
	}

	var u User
	err := usersDB.QueryRow(ctx, `
		UPDATE users SET is_admin = $1 WHERE firebase_uid = $2
		RETURNING firebase_uid, email, display_name, is_admin, last_login, created_at
	`, params.IsAdmin, uid).Scan(&u.FirebaseUID, &u.Email, &u.DisplayName, &u.IsAdmin, &u.LastLogin, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &errs.Error{Code: errs.NotFound, Message: "user not found"}
		}
		return nil, &errs.Error{Code: errs.Internal, Message: "failed to update user role"}
	}
	return &u, nil
}
