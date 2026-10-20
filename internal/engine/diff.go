// Package engine implements graph diff, planning, the compound pipeline,
// LLM runners (command + offline template) and document ingestion.
package engine

import (
	"path"
	"sort"

	"github.com/luckylucky0001/codewiki/internal/extract"
	"github.com/luckylucky0001/codewiki/internal/model"
)

// Change classes.
const (
	ClassUnchanged = "unchanged"
	ClassBody      = "body"
	ClassSignature = "signature"
	ClassAdded     = "added"
	ClassDeleted   = "deleted"
	ClassRenamed   = "renamed"
)

// Change is one non-unchanged symbol difference.
type Change struct {
	Class      string  `json:"class"`
	ID         string  `json:"id"`               // new id (or old id for deleted)
	OldID      string  `json:"old_id,omitempty"` // for renamed
	Kind       string  `json:"kind"`
	File       string  `json:"file"`
	Similarity float64 `json:"similarity,omitempty"`
	OldHash    string  `json:"old_hash,omitempty"`
	NewHash    string  `json:"new_hash,omitempty"`
}

// Diff is the result of comparing two graphs.
type Diff struct {
	Base           string         `json:"base"`
	Head           string         `json:"head"`
	Counts         map[string]int `json:"counts"`
	Changes        []Change       `json:"changes"`
	ModulesTotal   int            `json:"modules_total"`
	ModulesChanged []string       `json:"modules_changed"`
	FilesChanged   []string       `json:"changed_files"`
	// ChangedRouteIDs / ChangedRoutes are filled by ComputeImpact (e2epilot contract).
	ChangedRouteIDs []string      `json:"changed_route_ids"`
	ChangedRoutes   []RouteChange `json:"changed_routes"`
	Incompatible    bool          `json:"incompatible,omitempty"` // base graph missing or different version
}

// RenameThreshold is the minimum body similarity for a fuzzy rename.
const RenameThreshold = 0.80

// DiffGraphs classifies every symbol of old/new by id.
func DiffGraphs(old, cur *model.Graph) *Diff {
	d := &Diff{Counts: map[string]int{}, Changes: []Change{}, ModulesChanged: []string{}, FilesChanged: []string{}, ChangedRouteIDs: []string{}, ChangedRoutes: []RouteChange{}}
	if cur.Commit != "" {
		d.Head = cur.Commit
	}
	if old == nil || old.Version != model.GraphVersion {
		d.Incompatible = true
		old = &model.Graph{}
	} else {
		d.Base = old.Commit
	}
	old.Index()
	cur.Index()
	var added, deleted []*model.Symbol
	for _, s := range cur.Symbols {
		o := old.Get(s.ID)
		switch {
		case o == nil:
			added = append(added, s)
		case o.SigHash != s.SigHash:
			d.Changes = append(d.Changes, Change{Class: ClassSignature, ID: s.ID, Kind: s.Kind, File: s.File, OldHash: o.Hash, NewHash: s.Hash})
		case o.Hash != s.Hash:
			d.Changes = append(d.Changes, Change{Class: ClassBody, ID: s.ID, Kind: s.Kind, File: s.File, OldHash: o.Hash, NewHash: s.Hash})
		default:
			d.Counts[ClassUnchanged]++
		}
	}
	for _, s := range old.Symbols {
		if cur.Get(s.ID) == nil {
			deleted = append(deleted, s)
		}
	}
	// rename detection: exact normalized body first, then fuzzy within same file/parent
	usedA := map[string]bool{}
	var remainingDeleted []*model.Symbol
	for _, o := range deleted {
		var best *model.Symbol
		bestSim := 0.0
		for _, a := range added {
			if usedA[a.ID] || a.Kind != o.Kind || a.Platform != o.Platform {
				continue
			}
			sim := 0.0
			if a.NormHash == o.NormHash {
				sim = 1
			} else if a.File == o.File || path.Dir(a.File) == path.Dir(o.File) {
				sim = extract.Similarity(a.SimHash, o.SimHash)
			}
			if sim > bestSim {
				best, bestSim = a, sim
			}
		}
		if best != nil && bestSim >= RenameThreshold {
			usedA[best.ID] = true
			d.Changes = append(d.Changes, Change{Class: ClassRenamed, ID: best.ID, OldID: o.ID, Kind: o.Kind, File: best.File, Similarity: round2(bestSim), OldHash: o.Hash, NewHash: best.Hash})
			continue
		}
		remainingDeleted = append(remainingDeleted, o)
	}
	for _, a := range added {
		if !usedA[a.ID] {
			d.Changes = append(d.Changes, Change{Class: ClassAdded, ID: a.ID, Kind: a.Kind, File: a.File, NewHash: a.Hash})
		}
	}
	for _, o := range remainingDeleted {
		d.Changes = append(d.Changes, Change{Class: ClassDeleted, ID: o.ID, Kind: o.Kind, File: o.File, OldHash: o.Hash})
	}
	sort.Slice(d.Changes, func(i, j int) bool {
		if d.Changes[i].Class != d.Changes[j].Class {
			return d.Changes[i].Class < d.Changes[j].Class
		}
		return d.Changes[i].ID < d.Changes[j].ID
	})
	for _, c := range d.Changes {
		d.Counts[c.Class]++
	}
	// modules = directories containing source files
	mods := map[string]bool{}
	changedMods := map[string]bool{}
	for f := range cur.Files {
		mods[path.Dir(f)] = true
	}
	for f := range old.Files {
		mods[path.Dir(f)] = true
	}
	files := map[string]bool{}
	for f, fi := range cur.Files {
		if ofi, ok := old.Files[f]; !ok || ofi.Hash != fi.Hash {
			files[f] = true
		}
	}
	for f := range old.Files {
		if _, ok := cur.Files[f]; !ok {
			files[f] = true
		}
	}
	for _, c := range d.Changes {
		changedMods[path.Dir(c.File)] = true
	}
	for f := range files {
		d.FilesChanged = append(d.FilesChanged, f)
	}
	sort.Strings(d.FilesChanged)
	for m := range changedMods {
		d.ModulesChanged = append(d.ModulesChanged, m)
	}
	sort.Strings(d.ModulesChanged)
	d.ModulesTotal = len(mods)
	return d
}

func round2(f float64) float64 { return float64(int(f*100+0.5)) / 100 }

// StructuralRatio = (added+deleted+renamed+signature) / max(total symbols).
func (d *Diff) StructuralRatio(total int) float64 {
	if total == 0 {
		return 0
	}
	n := d.Counts[ClassAdded] + d.Counts[ClassDeleted] + d.Counts[ClassRenamed] + d.Counts[ClassSignature]
	return float64(n) / float64(total)
}

// ModuleRatio is the share of modules with at least one symbol change.
func (d *Diff) ModuleRatio() float64 {
	if d.ModulesTotal == 0 {
		return 0
	}
	return float64(len(d.ModulesChanged)) / float64(d.ModulesTotal)
}
