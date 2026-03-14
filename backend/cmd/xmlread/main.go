package main

import (
	"encoding/json"
	"fmt"
	"os"

	"encore.app/backend/db"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: xmlread <path>")
		os.Exit(1)
	}
	path := os.Args[1]
	result, err := db.BuildChapterDrafts(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	out, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(string(out))
}
