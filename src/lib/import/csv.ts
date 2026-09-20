import { MAX_CSV_COLUMNS, MAX_CSV_ROWS } from "./limits"
import { normalizeText } from "./markdown-file"

// A CSV file as a Markdown table. Notion exports each database this way,
// next to a folder of its rows as pages.

// Quoted fields may hold commas, line breaks, and doubled quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const source = normalizeText(text)

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field === "") quoted = true
    else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += char
  }
  if (field !== "" || row.length) rows.push([...row, field])
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""))
}

// A cell is one line of a table row, and a pipe would end it.
const cell = (value: string) => value.trim().replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ")

// Null when the file is empty, or too large to be a table worth reading.
export function csvToMarkdown(text: string): string | null {
  const rows = parseCsv(text)
  if (!rows.length) return null
  const columns = Math.max(...rows.map((cells) => cells.length))
  if (rows.length - 1 > MAX_CSV_ROWS || columns > MAX_CSV_COLUMNS) return null

  const line = (cells: string[]) =>
    `| ${Array.from({ length: columns }, (_, index) => cell(cells[index] ?? "")).join(" | ")} |`
  const [header, ...body] = rows
  return [line(header), `|${" --- |".repeat(columns)}`, ...body.map(line)].join("\n") + "\n"
}
