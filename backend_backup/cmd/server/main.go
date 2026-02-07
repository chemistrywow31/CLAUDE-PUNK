package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"claude-punk/internal/realtime"
	"claude-punk/internal/session"
	"claude-punk/internal/watcher"
)

// Config holds server configuration, loaded from environment variables.
type Config struct {
	Port           int
	StaticDir      string
	MaxSessions    int
	FileCountRatio int
}

func loadConfig() Config {
	cfg := Config{
		Port:           8420,
		StaticDir:      "./frontend/dist",
		MaxSessions:    10,
		FileCountRatio: 20,
	}

	if v := os.Getenv("PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.Port = n
		}
	}
	if v := os.Getenv("STATIC_DIR"); v != "" {
		cfg.StaticDir = v
	}
	if v := os.Getenv("MAX_SESSIONS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.MaxSessions = n
		}
	}
	if v := os.Getenv("FILE_COUNT_RATIO"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.FileCountRatio = n
		}
	}

	return cfg
}

func main() {
	cfg := loadConfig()

	// Initialize session manager.
	sessMgr := session.NewManager(cfg.MaxSessions)

	// Initialize file watcher (callback will be set after realtime server is created).
	var rtServer *realtime.Server
	fileWatch := watcher.New(cfg.FileCountRatio, func(sessionID string, fileCount, drinkCount int) {
		if rtServer != nil {
			rtServer.OnFileUpdate(sessionID, fileCount, drinkCount)
		}
	})

	// Initialize realtime server.
	rtServer = realtime.New(sessMgr, fileWatch, cfg.StaticDir)

	// Set up HTTP server.
	addr := fmt.Sprintf(":%d", cfg.Port)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: rtServer.Handler(),
	}

	// Graceful shutdown on signals.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("Shutting down...")
		fileWatch.Shutdown()
		sessMgr.Shutdown()
		httpServer.Close()
	}()

	log.Printf("Claude Punk server running on http://localhost:%d", cfg.Port)
	if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("HTTP server error: %v", err)
	}
}
