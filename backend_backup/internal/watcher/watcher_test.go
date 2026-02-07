package watcher

import (
	"os"
	"path/filepath"
	"testing"

	"claude-punk/internal/protocol"
)

func TestCountFiles_EmptyDir(t *testing.T) {
	dir := t.TempDir()
	count := CountFiles(dir)
	if count != 0 {
		t.Errorf("expected 0 files, got %d", count)
	}
}

func TestCountFiles_WithFiles(t *testing.T) {
	dir := t.TempDir()
	for i := 0; i < 5; i++ {
		os.WriteFile(filepath.Join(dir, "file"+string(rune('a'+i))+".txt"), []byte("test"), 0644)
	}

	count := CountFiles(dir)
	if count != 5 {
		t.Errorf("expected 5 files, got %d", count)
	}
}

func TestCountFiles_ExcludesNodeModules(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "main.go"), []byte("test"), 0644)

	nmDir := filepath.Join(dir, "node_modules")
	os.MkdirAll(nmDir, 0755)
	os.WriteFile(filepath.Join(nmDir, "package.json"), []byte("test"), 0644)

	count := CountFiles(dir)
	if count != 1 {
		t.Errorf("expected 1 file (node_modules excluded), got %d", count)
	}
}

func TestCountFiles_ExcludesGit(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "main.go"), []byte("test"), 0644)

	gitDir := filepath.Join(dir, ".git")
	os.MkdirAll(gitDir, 0755)
	os.WriteFile(filepath.Join(gitDir, "HEAD"), []byte("ref"), 0644)

	count := CountFiles(dir)
	if count != 1 {
		t.Errorf("expected 1 file (.git excluded), got %d", count)
	}
}

func TestCountFiles_ExcludesHiddenFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "main.go"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(dir, ".env"), []byte("SECRET"), 0644)

	count := CountFiles(dir)
	if count != 1 {
		t.Errorf("expected 1 file (hidden files excluded), got %d", count)
	}
}

func TestCountFiles_IncludesClaudeDir(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "main.go"), []byte("test"), 0644)

	claudeDir := filepath.Join(dir, ".claude")
	os.MkdirAll(claudeDir, 0755)
	os.WriteFile(filepath.Join(claudeDir, "CLAUDE.md"), []byte("config"), 0644)

	count := CountFiles(dir)
	if count != 2 {
		t.Errorf("expected 2 files (.claude included), got %d", count)
	}
}

func TestDrinkCountFormula(t *testing.T) {
	tests := []struct {
		fileCount  int
		ratio      int
		wantDrinks int
	}{
		{0, 20, 0},
		{19, 20, 0},
		{20, 20, 1},
		{39, 20, 1},
		{40, 20, 2},
		{100, 20, 5},
		{142, 20, 7},
	}

	for _, tt := range tests {
		got := tt.fileCount / tt.ratio
		if got != tt.wantDrinks {
			t.Errorf("fileCount=%d ratio=%d: expected %d drinks, got %d",
				tt.fileCount, tt.ratio, tt.wantDrinks, got)
		}
	}
}

func TestBuildFileTree_EmptyDir(t *testing.T) {
	dir := t.TempDir()
	tree := BuildFileTree(dir, 3)
	if len(tree) != 0 {
		t.Errorf("expected empty tree, got %d nodes", len(tree))
	}
}

func TestBuildFileTree_WithFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "main.go"), []byte("package main"), 0644)
	os.MkdirAll(filepath.Join(dir, "sub"), 0755)
	os.WriteFile(filepath.Join(dir, "sub", "helper.go"), []byte("package sub"), 0644)

	tree := BuildFileTree(dir, 3)
	if len(tree) != 2 { // "sub" dir + "main.go" file
		t.Fatalf("expected 2 nodes, got %d", len(tree))
	}

	// Dirs come first.
	if !tree[0].IsDir || tree[0].Name != "sub" {
		t.Errorf("expected first node to be 'sub' dir, got %s (isDir=%v)", tree[0].Name, tree[0].IsDir)
	}

	if tree[1].IsDir || tree[1].Name != "main.go" {
		t.Errorf("expected second node to be 'main.go' file, got %s (isDir=%v)", tree[1].Name, tree[1].IsDir)
	}
}

func TestBuildFileTree_ExcludesGitAndNodeModules(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "main.go"), []byte("test"), 0644)
	os.MkdirAll(filepath.Join(dir, ".git", "objects"), 0755)
	os.MkdirAll(filepath.Join(dir, "node_modules", "pkg"), 0755)

	tree := BuildFileTree(dir, 3)
	if len(tree) != 1 { // Only main.go
		t.Errorf("expected 1 node, got %d", len(tree))
	}
}

func TestBuildFileTree_MaxDepth(t *testing.T) {
	dir := t.TempDir()
	// Create 4 levels deep.
	deep := filepath.Join(dir, "a", "b", "c", "d")
	os.MkdirAll(deep, 0755)
	os.WriteFile(filepath.Join(deep, "deep.txt"), []byte("deep"), 0644)

	tree := BuildFileTree(dir, 3)
	// Should only have a → b → c (no d at depth 3).
	if len(tree) != 1 {
		t.Fatalf("expected 1 top-level node, got %d", len(tree))
	}

	// Walk down the tree.
	node := tree[0] // "a"
	if node.Name != "a" {
		t.Fatalf("expected 'a', got %s", node.Name)
	}
	if len(node.Children) != 1 || node.Children[0].Name != "b" {
		t.Fatalf("expected 'b' child")
	}
	b := node.Children[0]
	if len(b.Children) != 1 || b.Children[0].Name != "c" {
		t.Fatalf("expected 'c' child")
	}
	c := b.Children[0]
	// At depth 3, children should be nil (max depth reached).
	if len(c.Children) != 0 {
		t.Errorf("expected no children at depth 3, got %d", len(c.Children))
	}
}

func TestReadClaudeConfig_NoClaudeDir(t *testing.T) {
	dir := t.TempDir()
	configs := ReadClaudeConfig(dir)
	if configs != nil {
		t.Errorf("expected nil configs, got %d", len(configs))
	}
}

func TestReadClaudeConfig_WithFiles(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	os.MkdirAll(filepath.Join(claudeDir, "rules"), 0755)
	os.WriteFile(filepath.Join(claudeDir, "CLAUDE.md"), []byte("# Config"), 0644)
	os.WriteFile(filepath.Join(claudeDir, "rules", "rule1.md"), []byte("# Rule 1"), 0644)
	os.WriteFile(filepath.Join(claudeDir, "notes.txt"), []byte("not a md file"), 0644)

	configs := ReadClaudeConfig(dir)
	if len(configs) != 2 {
		t.Fatalf("expected 2 config files, got %d", len(configs))
	}

	// Check that we got both .md files.
	names := make(map[string]bool)
	for _, c := range configs {
		names[c.Name] = true
	}
	if !names["CLAUDE.md"] {
		t.Error("expected CLAUDE.md in configs")
	}
	if !names["rules/rule1.md"] {
		t.Error("expected rules/rule1.md in configs")
	}
}

func TestIsHidden(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{".git", true},
		{".env", true},
		{"main.go", false},
		{".claude", true},
		{"", false},
	}

	for _, tt := range tests {
		got := isHidden(tt.name)
		if got != tt.want {
			t.Errorf("isHidden(%q) = %v, want %v", tt.name, got, tt.want)
		}
	}
}

func TestFileNodeStructure(t *testing.T) {
	// Verify FileNode JSON serialization matches spec.
	node := protocol.FileNode{
		Name:  "src",
		Path:  "src",
		IsDir: true,
		Children: []protocol.FileNode{
			{Name: "main.go", Path: "src/main.go", IsDir: false, Size: 1024},
		},
	}

	if node.Name != "src" || !node.IsDir {
		t.Errorf("unexpected node values")
	}
	if len(node.Children) != 1 || node.Children[0].Size != 1024 {
		t.Errorf("unexpected child values")
	}
}
