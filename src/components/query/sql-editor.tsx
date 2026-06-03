"use client";

import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { EditorView } from "@codemirror/view";

/**
 * CodeMirror-based SQL editor with PostgreSQL syntax highlighting. Default
 * export so it can be loaded client-only via next/dynamic (CodeMirror touches
 * `document` and must not run during SSR).
 */
export default function SqlEditor({
  value,
  onChange,
  height = "280px",
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  readOnly?: boolean;
}) {
  return (
    <CodeMirror
      value={value}
      height={height}
      onChange={onChange}
      readOnly={readOnly}
      theme="light"
      extensions={[sql({ dialect: PostgreSQL, upperCaseKeywords: false }), EditorView.lineWrapping]}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        foldGutter: false,
        autocompletion: true,
        bracketMatching: true,
      }}
      className="overflow-hidden rounded-md border text-[13px]"
    />
  );
}
