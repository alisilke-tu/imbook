package submissions

import (
	"context"
	"regexp"
	"time"

	"encore.dev/beta/errs"
	"encore.dev/storage/sqldb"
)

// Database for storing submissions.
var db = sqldb.NewDatabase("submissions", sqldb.DatabaseConfig{
	Migrations: "./migrations",
})

// Valid roles that can be submitted.
var validRoles = map[string]bool{
	"cio":             true,
	"cto":             true,
	"ceo":             true,
	"cfo":             true,
	"coo":             true,
	"other-c-level":   true,
	"director":        true,
	"manager":         true,
	"analyst":         true,
	"consultant":      true,
	"other":           true,
}

// Email validation regex.
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// Submission represents a form submission.
type Submission struct {
	ID          int64     `json:"id"`
	Question    string    `json:"question"`
	Role        string    `json:"role"`
	Email       string    `json:"email"`
	SubmittedAt time.Time `json:"submitted_at"`
}

// SubmitParams are the parameters for submitting a form.
type SubmitParams struct {
	Question string `json:"question"`
	Role     string `json:"role"`
	Email    string `json:"email"`
}

// Validate validates the submission parameters.
func (p *SubmitParams) Validate() error {
	if p.Question == "" {
		return &errs.Error{
			Code:    errs.InvalidArgument,
			Message: "question is required",
		}
	}

	if p.Role == "" {
		return &errs.Error{
			Code:    errs.InvalidArgument,
			Message: "role is required",
		}
	}

	if !validRoles[p.Role] {
		return &errs.Error{
			Code:    errs.InvalidArgument,
			Message: "invalid role",
		}
	}

	// Email is optional, but if provided, must be valid
	if p.Email != "" && !emailRegex.MatchString(p.Email) {
		return &errs.Error{
			Code:    errs.InvalidArgument,
			Message: "invalid email format",
		}
	}

	return nil
}

// Submit submits a new form response.
//
//encore:api public method=POST path=/submissions/submit
func Submit(ctx context.Context, params *SubmitParams) error {
	_, err := db.Exec(ctx, `
		INSERT INTO submissions (question, role, email)
		VALUES ($1, $2, $3)
	`, params.Question, params.Role, params.Email)

	if err != nil {
		return &errs.Error{
			Code:    errs.Internal,
			Message: "failed to save submission",
		}
	}

	return nil
}

// ListResponse contains the list of submissions.
type ListResponse struct {
	Submissions []Submission `json:"submissions"`
}

// List returns all submissions.
//
//encore:api auth method=GET path=/submissions
func List(ctx context.Context) (*ListResponse, error) {
	rows, err := db.Query(ctx, `
		SELECT id, question, role, email, submitted_at
		FROM submissions
		ORDER BY submitted_at DESC
	`)
	if err != nil {
		return nil, &errs.Error{
			Code:    errs.Internal,
			Message: "failed to fetch submissions",
		}
	}
	defer rows.Close()

	var submissions []Submission
	for rows.Next() {
		var s Submission
		if err := rows.Scan(&s.ID, &s.Question, &s.Role, &s.Email, &s.SubmittedAt); err != nil {
			return nil, &errs.Error{
				Code:    errs.Internal,
				Message: "failed to scan submission",
			}
		}
		submissions = append(submissions, s)
	}

	if err := rows.Err(); err != nil {
		return nil, &errs.Error{
			Code:    errs.Internal,
			Message: "error iterating submissions",
		}
	}

	return &ListResponse{Submissions: submissions}, nil
}
