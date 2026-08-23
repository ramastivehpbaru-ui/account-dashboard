// ================================================================
// PATCH: Auto IP Lookup on render (no button needed for basic info)
// The lookup button still exists for manual refresh
// ================================================================

// Override buildSpyCard to auto-trigger IP lookup for unknown locations
const _origBuildSpyCard = buildSpyCard;
// We'll integrate fixes directly into the main script instead

