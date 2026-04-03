package main

import (
	"context"
	"fmt"
	"os"

	"encore.dev/storage/sqldb"
)

// This script promotes a user to admin by updating the database.
// Usage: go run scripts/set-admin.go <firebase-uid-or-email>

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run scripts/set-admin.go <firebase-uid-or-email>")
		os.Exit(1)
	}

	identifier := os.Args[1]
	ctx := context.Background()

	// Connect to the auth database
	db := sqldb.NewDatabase("auth", sqldb.DatabaseConfig{
		Migrations: "./backend/auth/migrations",
	})

	// Try to update by firebase_uid first, then by email
	result, err := db.Exec(ctx, `
		UPDATE users SET is_admin = true 
		WHERE firebase_uid = $1 OR email = $1
	`, identifier)

	if err != nil {
		fmt.Printf("Error updating user: %v\n", err)
		os.Exit(1)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		fmt.Printf("No user found with UID or email: %s\n", identifier)
		fmt.Println("Make sure the user has logged in at least once to be created in the database.")
		os.Exit(1)
	}

	fmt.Printf("Successfully promoted user to admin: %s\n", identifier)
	fmt.Println("The user will have admin privileges on their next login.")
}
