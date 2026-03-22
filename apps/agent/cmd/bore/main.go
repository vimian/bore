package main

import (
	"os"

	"github.com/vimian/bore/apps/agent/internal/agent"
)

func main() {
	if err := agent.Run(os.Args[1:]); err != nil {
		os.Exit(1)
	}
}
