package watcher

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"claude-punk/internal/protocol"

	"github.com/fsnotify/fsnotify"
)

const (
	debounceInterval = 500 * time.Millisecond
	maxTreeDepth     = 3
)

// excludedDirs are directories excluded from file counting and tree generation.
var excludedDirs = map[string]bool{
	"node_modules": true,
	".git":         true,
	"vendor":       true,
}

// UpdateCallback is called when the file count changes for a session.
type UpdateCallback func(sessionID string, fileCount, drinkCount int)

// Watcher monitors working directories for file changes.
type Watcher struct {
	mu             sync.RWMutex
	watchers       map[string]*sessionWatcher // sessionID → watcher
	fileCountRatio int
	callback       UpdateCallback
}

type sessionWatcher struct {
	sessionID string
	workDir   string
	fsWatcher *fsnotify.Watcher
	cancel    chan struct{}
	lastCount int
}

// New creates a new file system watcher.
func New(fileCountRatio int, callback UpdateCallback) *Watcher {
	return &Watcher{
		watchers:       make(map[string]*sessionWatcher),
		fileCountRatio: fileCountRatio,
		callback:       callback,
	}
}

// Watch starts watching a directory for a given session.
func (w *Watcher) Watch(sessionID, workDir string) error {
	fsW, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	sw := &sessionWatcher{
		sessionID: sessionID,
		workDir:   workDir,
		fsWatcher: fsW,
		cancel:    make(chan struct{}),
		lastCount: -1, // Force initial update.
	}

	// Add directories recursively.
	if err := addDirsRecursive(fsW, workDir); err != nil {
		fsW.Close()
		return err
	}

	w.mu.Lock()
	w.watchers[sessionID] = sw
	w.mu.Unlock()

	// Run the event loop.
	go w.watchLoop(sw)

	// Compute initial file count.
	go func() {
		count := CountFiles(workDir)
		drinkCount := count / w.fileCountRatio
		sw.lastCount = count
		if w.callback != nil {
			w.callback(sessionID, count, drinkCount)
		}
	}()

	return nil
}

// Unwatch stops watching a session's directory.
func (w *Watcher) Unwatch(sessionID string) {
	w.mu.Lock()
	sw, ok := w.watchers[sessionID]
	if ok {
		delete(w.watchers, sessionID)
	}
	w.mu.Unlock()

	if ok {
		close(sw.cancel)
		sw.fsWatcher.Close()
	}
}

// watchLoop processes fsnotify events with debouncing.
func (w *Watcher) watchLoop(sw *sessionWatcher) {
	var timer *time.Timer

	for {
		select {
		case <-sw.cancel:
			if timer != nil {
				timer.Stop()
			}
			return

		case event, ok := <-sw.fsWatcher.Events:
			if !ok {
				return
			}

			// If a new directory is created, watch it too.
			if event.Has(fsnotify.Create) {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					base := filepath.Base(event.Name)
					if !excludedDirs[base] && !isHidden(base) {
						sw.fsWatcher.Add(event.Name)
					}
				}
			}

			// Debounce: reset timer on each event.
			if timer != nil {
				timer.Stop()
			}
			timer = time.AfterFunc(debounceInterval, func() {
				w.recount(sw)
			})

		case err, ok := <-sw.fsWatcher.Errors:
			if !ok {
				return
			}
			log.Printf("watcher error for session %s: %v", sw.sessionID, err)
		}
	}
}

// recount recalculates file count and notifies if changed.
func (w *Watcher) recount(sw *sessionWatcher) {
	count := CountFiles(sw.workDir)
	drinkCount := count / w.fileCountRatio

	if count != sw.lastCount {
		sw.lastCount = count
		if w.callback != nil {
			w.callback(sw.sessionID, count, drinkCount)
		}
	}
}

// CountFiles counts all non-excluded files in a directory.
func CountFiles(dir string) int {
	count := 0
	filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // Skip inaccessible paths.
		}

		name := d.Name()

		if d.IsDir() {
			if excludedDirs[name] {
				return filepath.SkipDir
			}
			// Skip hidden dirs except .claude.
			if isHidden(name) && name != ".claude" && path != dir {
				return filepath.SkipDir
			}
			return nil
		}

		// Skip hidden files (except inside .claude).
		rel, _ := filepath.Rel(dir, path)
		if isHidden(name) && !strings.HasPrefix(rel, ".claude") {
			return nil
		}

		count++
		return nil
	})
	return count
}

// BuildFileTree generates a FileNode tree for a directory up to maxDepth levels.
func BuildFileTree(dir string, maxDepth int) []protocol.FileNode {
	return buildTreeRecursive(dir, dir, 0, maxDepth)
}

func buildTreeRecursive(rootDir, currentDir string, depth, maxDepth int) []protocol.FileNode {
	if depth >= maxDepth {
		return nil
	}

	entries, err := os.ReadDir(currentDir)
	if err != nil {
		return nil
	}

	// Separate dirs and files, then sort: dirs first, files second.
	var dirs, files []os.DirEntry
	for _, entry := range entries {
		name := entry.Name()
		if excludedDirs[name] {
			continue
		}
		if isHidden(name) && name != ".claude" {
			continue
		}
		if entry.IsDir() {
			dirs = append(dirs, entry)
		} else {
			files = append(files, entry)
		}
	}

	nodes := make([]protocol.FileNode, 0, len(dirs)+len(files))

	for _, d := range dirs {
		fullPath := filepath.Join(currentDir, d.Name())
		relPath, _ := filepath.Rel(rootDir, fullPath)
		node := protocol.FileNode{
			Name:     d.Name(),
			Path:     relPath,
			IsDir:    true,
			Children: buildTreeRecursive(rootDir, fullPath, depth+1, maxDepth),
		}
		nodes = append(nodes, node)
	}

	for _, f := range files {
		fullPath := filepath.Join(currentDir, f.Name())
		relPath, _ := filepath.Rel(rootDir, fullPath)
		var size int64
		if info, err := f.Info(); err == nil {
			size = info.Size()
		}
		nodes = append(nodes, protocol.FileNode{
			Name:  f.Name(),
			Path:  relPath,
			IsDir: false,
			Size:  size,
		})
	}

	return nodes
}

// ReadClaudeConfig reads all .md files in a .claude directory.
func ReadClaudeConfig(workDir string) []protocol.ConfigFile {
	claudeDir := filepath.Join(workDir, ".claude")
	info, err := os.Stat(claudeDir)
	if err != nil || !info.IsDir() {
		return nil
	}

	var configs []protocol.ConfigFile
	readConfigDir(claudeDir, "", &configs)
	return configs
}

func readConfigDir(dir, prefix string, configs *[]protocol.ConfigFile) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		fullPath := filepath.Join(dir, entry.Name())
		relName := entry.Name()
		if prefix != "" {
			relName = prefix + "/" + entry.Name()
		}

		if entry.IsDir() {
			readConfigDir(fullPath, relName, configs)
			continue
		}

		if strings.HasSuffix(entry.Name(), ".md") {
			data, err := os.ReadFile(fullPath)
			if err != nil {
				continue
			}
			*configs = append(*configs, protocol.ConfigFile{
				Name:    relName,
				Content: string(data),
			})
		}
	}
}

// Shutdown stops all watchers.
func (w *Watcher) Shutdown() {
	w.mu.Lock()
	ids := make([]string, 0, len(w.watchers))
	for id := range w.watchers {
		ids = append(ids, id)
	}
	w.mu.Unlock()

	for _, id := range ids {
		w.Unwatch(id)
	}
}

// addDirsRecursive adds a directory and its subdirectories to an fsnotify watcher.
func addDirsRecursive(w *fsnotify.Watcher, dir string) error {
	return filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}

		name := d.Name()
		if excludedDirs[name] && path != dir {
			return filepath.SkipDir
		}
		if isHidden(name) && name != ".claude" && path != dir {
			return filepath.SkipDir
		}

		return w.Add(path)
	})
}

func isHidden(name string) bool {
	return len(name) > 0 && name[0] == '.'
}
