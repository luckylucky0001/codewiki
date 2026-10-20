// Package model holds the shared data types of codewiki: the symbol graph,
// the facts interchange schema and the plan format.
package model

// GraphVersion is bumped whenever hashing/normalization changes so that old
// snapshots are treated as incompatible (forces a full rebuild).
const GraphVersion = 1

// Symbol is one declaration extracted from source code.
type Symbol struct {
	ID        string   `json:"id"`
	Platform  string   `json:"platform"`
	Lang      string   `json:"lang"`
	Kind      string   `json:"kind"`
	Name      string   `json:"name"`
	Qual      string   `json:"qual"`
	Parent    string   `json:"parent,omitempty"`
	File      string   `json:"file"`
	StartLine int      `json:"start_line"`
	EndLine   int      `json:"end_line"`
	Signature string   `json:"signature"`
	Hash      string   `json:"hash"`
	SigHash   string   `json:"sig_hash"`
	NormHash  string   `json:"norm_hash"`
	SimHash   string   `json:"simhash"`
	Value     string   `json:"value,omitempty"` // literal initializer for constants
	Refs      []string `json:"refs,omitempty"`

	RefNames  []string `json:"-"` // unresolved identifier names (scan-time only)
	CallNames []string `json:"-"` // subset of RefNames used as calls (followed by "(")
}

// FileInfo describes one scanned source file.
type FileInfo struct {
	Platform string `json:"platform"`
	Lang     string `json:"lang"`
	Hash     string `json:"hash"`
	Symbols  int    `json:"symbols"`
}

// ParseFailure records a file the parser could not fully handle.
type ParseFailure struct {
	File  string `json:"file"`
	Line  int    `json:"line,omitempty"`
	Error string `json:"error"`
}

// Graph is the symbol-graph snapshot stored in .kb/graph.json.
type Graph struct {
	Version       int                 `json:"version"`
	Commit        string              `json:"commit,omitempty"`
	Symbols       []*Symbol           `json:"symbols"`
	Files         map[string]FileInfo `json:"files"`
	ParseFailures []ParseFailure      `json:"parse_failures"`

	byID map[string]*Symbol
}

// Index builds the id lookup table. Call after mutating Symbols.
func (g *Graph) Index() {
	g.byID = make(map[string]*Symbol, len(g.Symbols))
	for _, s := range g.Symbols {
		g.byID[s.ID] = s
	}
}

// Get returns the symbol with the given id or nil.
func (g *Graph) Get(id string) *Symbol {
	if g == nil {
		return nil
	}
	if g.byID == nil {
		g.Index()
	}
	return g.byID[id]
}

// Route is one entry of routes.json (interchange schema shared with e2epilot).
type Route struct {
	Platform string `json:"platform"`
	RouteID  string `json:"route_id"`
	Pattern  string `json:"pattern"`
	Deeplink string `json:"deeplink"`
	File     string `json:"file"`
	Symbol   string `json:"symbol"`
}

// TestID is one entry of testids.json.
type TestID struct {
	Platform string `json:"platform"`
	Tid      string `json:"tid"`
	RouteID  string `json:"route_id"`
	File     string `json:"file"`
	Line     int    `json:"line"`
}

// API is one entry of apis.json.
type API struct {
	Platform string `json:"platform"`
	Method   string `json:"method"`
	Path     string `json:"path"`
	File     string `json:"file"`
	Symbol   string `json:"symbol"`
}

// Facts aggregates everything the deterministic extractors found.
type Facts struct {
	Routes  []Route  `json:"routes"`
	TestIDs []TestID `json:"testids"`
	APIs    []API    `json:"apis"`
	// Extra, platform-specific facts rendered into facts/<platform>/*.md only.
	Schemes  map[string][]string `json:"schemes,omitempty"`  // platform -> deeplink schemes
	Entries  []Entry             `json:"entries,omitempty"`  // activities, main_pages, abilities
	Warnings []string            `json:"warnings,omitempty"` // non-fatal extractor notes
}

// Entry is a platform entry point (Activity, UIAbility, main page, SwiftUI App).
type Entry struct {
	Platform string `json:"platform"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	File     string `json:"file"`
}

// Requirement is one entry of requirements.json (consumed by e2epilot).
type Requirement struct {
	ID       string   `json:"id"`
	Source   string   `json:"source"`
	Text     string   `json:"text"`
	Status   string   `json:"status"` // verified | conflict | unverifiable
	Anchors  []Anchor `json:"anchors"`
	RouteIDs []string `json:"route_ids"`
	Evidence []string `json:"evidence,omitempty"`
}

// Anchor ties a page or claim to a symbol body hash.
type Anchor struct {
	Sym  string `json:"sym" yaml:"sym"`
	Hash string `json:"hash" yaml:"hash"`
}
