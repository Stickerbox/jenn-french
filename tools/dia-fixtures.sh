#!/bin/bash
# Builds a disposable Dia artifact tree and prints its path, for verifying
# tools/publish-dia-artifact.sh by hand.
#
# There is no automated harness for that script — npm test is vitest only — so
# $DIA_ARTIFACTS is the hook that makes it testable, and this is what fills it.
# Each artifact below exists for one numbered check in
# docs/superpowers/plans/2026-08-04-local-page-assets.md.
#
#   export DIA_ARTIFACTS="$(tools/dia-fixtures.sh)"
#   tools/publish-dia-artifact.sh --list
set -euo pipefail

ROOT="${TMPDIR:-/tmp}/dia-fixtures"
rm -rf "$ROOT"

# Dia's own layout is <uuid>/<name>/site/index.html. The uuid is arbitrary here;
# what matters is that the script finds artifacts by that path shape.
art() { mkdir -p "$ROOT/uuid-$1/$1/site"; printf '%s' "$ROOT/uuid-$1/$1/site"; }

# 1. Self-contained. No marker on the picker row at all.
P=$(art plain)
cat > "$P/index.html" <<'HTML'
<html><head><title>Plain</title></head><body><h1>Nothing linked</h1></body></html>
HTML

# 2. Siblings that all resolve, including a font reached THROUGH the stylesheet
#    rather than named by the document. That is the transitive case.
P=$(art styled)
mkdir -p "$P/fonts"
cat > "$P/index.html" <<'HTML'
<html><head><title>Styled</title>
<link rel="stylesheet" href="styles.css">
<script src="./app.js?v=2"></script></head>
<body><h1 id="t">Styled</h1></body></html>
HTML
cat > "$P/styles.css" <<'CSS'
@font-face{font-family:F;src:url(./fonts/x.woff2) format("woff2")}
h1{font-family:F,serif;color:#c8102e}
CSS
printf 'not-a-real-woff2' > "$P/fonts/x.woff2"
printf 'document.getElementById("t").textContent = "Styled by app.js";' > "$P/app.js"

# 3. A stylesheet in a subdirectory reaching back out with ../ — the case that
#    proves refs resolve against the STYLESHEET and not the document.
P=$(art nested)
mkdir -p "$P/css" "$P/img"
cat > "$P/index.html" <<'HTML'
<html><head><title>Nested</title>
<link rel="stylesheet" href="css/main.css"></head>
<body><h1>Nested</h1></body></html>
HTML
printf 'body{background:url(../img/bg.png)}' > "$P/css/main.css"
printf 'not-a-real-png' > "$P/img/bg.png"

# 4. A ref to a file that is simply not there.
P=$(art broken)
cat > "$P/index.html" <<'HTML'
<html><head><title>Broken</title>
<link rel="stylesheet" href="missing.css"></head>
<body><h1>Broken</h1></body></html>
HTML

# 5. Two escapes: a .. traversal and a symlink pointing out of the artifact.
#    NEITHER may ever be published. The secret sits outside site/ deliberately —
#    this is the check that must not be skipped.
P=$(art evil)
mkdir -p "$ROOT/uuid-evil/evil/secret"
printf 'BEGIN-PRIVATE-KEY-DO-NOT-PUBLISH' > "$ROOT/uuid-evil/evil/secret/key.pem"
ln -s "$ROOT/uuid-evil/evil/secret" "$P/escape"
cat > "$P/index.html" <<'HTML'
<html><head><title>Evil</title></head><body>
<img src="../secret/key.pem"><img src="escape/key.pem">
</body></html>
HTML

# 6. A local script beside a CDN one. Both must end up inlined, by the two
#    different sources.
P=$(art mixed)
cat > "$P/index.html" <<'HTML'
<html><head><title>Mixed</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js"></script>
<script src="local.js"></script></head><body><h1>Mixed</h1></body></html>
HTML
printf 'window.__local = true;' > "$P/local.js"

printf '%s' "$ROOT"
