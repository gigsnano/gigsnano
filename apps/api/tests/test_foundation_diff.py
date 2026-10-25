from gigsnano_api.features.foundation.diff import parse_unified_diff

DIFF = """diff --git a/src/Button.tsx b/src/Button.tsx
index 111..222 100644
--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,3 +1,4 @@
 import React from 'react'
-const old = 1
+const color = '#ff0000'
+import moment from 'moment'
 export default Button
"""


def test_returns_only_added_lines_with_stripped_path():
    out = parse_unified_diff(DIFF)
    assert [c.text for c in out] == ["const color = '#ff0000'", "import moment from 'moment'"]
    assert all(c.file == "src/Button.tsx" for c in out)


def test_added_line_numbers_are_new_side():
    out = parse_unified_diff(DIFF)
    # hunk starts at new line 1: " import" =1, "+const color" =2, "+import moment" =3
    assert out[0].line == 2
    assert out[1].line == 3


def test_empty_diff_is_empty():
    assert parse_unified_diff("") == []
