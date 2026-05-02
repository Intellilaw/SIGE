param(
  [Parameter(Mandatory = $true)]
  [string]$TemplatePath,

  [Parameter(Mandatory = $true)]
  [string]$QuoteJsonPath,

  [Parameter(Mandatory = $true)]
  [string]$WordOutputPath,

  [string]$PdfOutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$wdAlignParagraphLeft = 0
$wdAlignParagraphCenter = 1
$wdAlignParagraphRight = 2
$wdAlignParagraphJustify = 3
$wdCellAlignVerticalCenter = 1
$wdCollapseEnd = 0
$wdExportFormatPdf = 17
$wdFormatDocumentDefault = 16
$wdHeaderFooterPrimary = 1
$wdLineStyleNone = 0
$wdLineStyleSingle = 1
$wdLineWidth025pt = 2
$wdLineWidth050pt = 4
$wdLineWidth075pt = 6
$wdLineWidth100pt = 8
$wdRowHeightAtLeast = 1
$wdBorderTop = -1
$wdBorderLeft = -2
$wdBorderBottom = -3
$wdBorderRight = -4
$wdBorderHorizontal = -5
$wdBorderVertical = -6
$wdBorderDiagonalDown = -7
$wdBorderDiagonalUp = -8

function Get-WordColor {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Red,

    [Parameter(Mandatory = $true)]
    [int]$Green,

    [Parameter(Mandatory = $true)]
    [int]$Blue
  )

  return $Red + ($Green * 256) + ($Blue * 65536)
}

$brandNavy = Get-WordColor -Red 11 -Green 31 -Blue 51
$brandBlue = Get-WordColor -Red 23 -Green 74 -Blue 122
$brandGold = Get-WordColor -Red 169 -Green 124 -Blue 26
$textCharcoal = Get-WordColor -Red 26 -Green 35 -Blue 48
$textMuted = Get-WordColor -Red 79 -Green 94 -Blue 112
$tableBorderColor = Get-WordColor -Red 96 -Green 114 -Blue 132
$tableTitleFill = Get-WordColor -Red 15 -Green 48 -Blue 82
$tableHeaderFill = Get-WordColor -Red 216 -Green 226 -Blue 240
$tableConceptFill = Get-WordColor -Red 244 -Green 247 -Blue 250
$tableTotalLabelFill = Get-WordColor -Red 194 -Green 210 -Blue 232
$tableTotalAmountFill = Get-WordColor -Red 235 -Green 240 -Blue 247
$tableBlackFill = Get-WordColor -Red 0 -Green 0 -Blue 0
$tableWhiteFill = Get-WordColor -Red 255 -Green 255 -Blue 255
$tableWhiteText = Get-WordColor -Red 255 -Green 255 -Blue 255

function Format-Mxn {
  param(
    [Parameter(Mandatory = $true)]
    [double]$Value
  )

  $culture = [System.Globalization.CultureInfo]::GetCultureInfo("es-MX")
  return $Value.ToString("C2", $culture)
}

function Add-Paragraph {
  param(
    [Parameter(Mandatory = $true)]
    $Selection,

    [Parameter(Mandatory = $true)]
    [string]$Text,

    [int]$Alignment = $wdAlignParagraphLeft,
    [double]$FontSize = 11,
    [bool]$Bold = $false,
    [int]$SpaceAfter = 10,
    [int]$SpaceBefore = 0,
    [string]$FontName = "Aptos",
    [int]$FontColor = $textCharcoal,
    [double]$CharacterSpacing = 0
  )

  $Selection.ParagraphFormat.Alignment = $Alignment
  $Selection.ParagraphFormat.SpaceAfter = $SpaceAfter
  $Selection.ParagraphFormat.SpaceBefore = $SpaceBefore
  $Selection.ParagraphFormat.LineSpacingRule = 0
  $Selection.Font.Name = $FontName
  $Selection.Font.Size = $FontSize
  $Selection.Font.Bold = if ($Bold) { 1 } else { 0 }
  $Selection.Font.Color = $FontColor
  $Selection.Font.Spacing = $CharacterSpacing
  $Selection.TypeText($Text)
  $Selection.TypeParagraph()
}

function Set-CellText {
  param(
    [Parameter(Mandatory = $true)]
    $Cell,

    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Text,

    [int]$Alignment = $wdAlignParagraphLeft,
    [bool]$Bold = $false,
    [double]$FontSize = 9.5,
    [int]$FillColor = $tableWhiteFill,
    [int]$FontColor = $textCharcoal,
    [string]$FontName = "Aptos"
  )

  $Cell.Range.Text = $Text
  $Cell.Range.ParagraphFormat.Alignment = $Alignment
  $Cell.Range.ParagraphFormat.SpaceAfter = 0
  $Cell.Range.ParagraphFormat.SpaceBefore = 0
  $Cell.Range.ParagraphFormat.LineSpacingRule = 0
  $Cell.Range.Font.Name = $FontName
  $Cell.Range.Font.Size = $FontSize
  $Cell.Range.Font.Bold = if ($Bold) { 1 } else { 0 }
  $Cell.Range.Font.Color = $FontColor
  $Cell.VerticalAlignment = $wdCellAlignVerticalCenter
  Clear-CellBorders -Cell $Cell

  if ($FillColor -ge 0) {
    $Cell.Shading.BackgroundPatternColor = $FillColor
  }
}

function Set-DocumentDefaults {
  param(
    [Parameter(Mandatory = $true)]
    $Document
  )

  $Document.Content.Font.Name = "Aptos"
  $Document.Content.Font.Color = $textCharcoal
  $Document.Content.ParagraphFormat.SpaceAfter = 8
  $Document.Content.ParagraphFormat.LineSpacingRule = 0
}

function Set-TableStyle {
  param(
    [Parameter(Mandatory = $true)]
    $Table
  )

  $Table.AllowAutoFit = $false
  try {
    $Table.AllowSpacingBetweenCells = $true
  }
  catch {
    # Older Word COM versions may not expose this property.
  }
  $Table.TopPadding = 5
  $Table.BottomPadding = 5
  $Table.LeftPadding = 6
  $Table.RightPadding = 6
  $Table.Spacing = 1
  $Table.Shading.BackgroundPatternColor = $brandNavy
  $Table.Rows.Alignment = $wdAlignParagraphCenter
  $Table.Rows.HeightRule = $wdRowHeightAtLeast
  $Table.Rows.Height = 18
  Set-TableSolidBorders -Table $Table
}

function Set-TableBorder {
  param(
    [Parameter(Mandatory = $true)]
    $Table,

    [Parameter(Mandatory = $true)]
    [int]$BorderType,

    [Parameter(Mandatory = $true)]
    [int]$Color,

    [Parameter(Mandatory = $true)]
    [int]$Width
  )

  try {
    $border = $Table.Borders.Item($BorderType)
    $border.LineStyle = $wdLineStyleSingle
    $border.LineWidth = $Width
    $border.Color = $Color
  }
  catch {
    # Single-cell tables do not expose internal horizontal/vertical borders.
  }
}

function Set-CellBorder {
  param(
    [Parameter(Mandatory = $true)]
    $Cell,

    [Parameter(Mandatory = $true)]
    [int]$BorderType,

    [Parameter(Mandatory = $true)]
    [int]$Color,

    [Parameter(Mandatory = $true)]
    [int]$Width
  )

  $border = $Cell.Borders.Item($BorderType)
  $border.LineStyle = $wdLineStyleSingle
  $border.LineWidth = $Width
  $border.Color = $Color
}

function Clear-CellBorders {
  param(
    [Parameter(Mandatory = $true)]
    $Cell
  )

  foreach ($borderType in @(
    $wdBorderTop,
    $wdBorderLeft,
    $wdBorderBottom,
    $wdBorderRight,
    $wdBorderDiagonalDown,
    $wdBorderDiagonalUp
  )) {
    try {
      $Cell.Borders.Item($borderType).LineStyle = $wdLineStyleNone
    }
    catch {
      # Some merged cells do not expose every border through COM.
    }
  }
}

function Clear-TableBorder {
  param(
    [Parameter(Mandatory = $true)]
    $Table,

    [Parameter(Mandatory = $true)]
    [int]$BorderType
  )

  try {
    $border = $Table.Borders.Item($BorderType)
    $border.LineStyle = $wdLineStyleNone
  }
  catch {
    # Single-cell tables do not expose internal horizontal/vertical borders.
  }
}

function Set-CellSolidBorders {
  param(
    [Parameter(Mandatory = $true)]
    $Cell,

    [int]$Color = $brandNavy,
    [int]$Width = $wdLineWidth050pt
  )

  foreach ($borderType in @($wdBorderTop, $wdBorderLeft, $wdBorderBottom, $wdBorderRight)) {
    Set-CellBorder -Cell $Cell -BorderType $borderType -Color $Color -Width $Width
  }
}

function Set-TableCellGridBorders {
  param(
    [Parameter(Mandatory = $true)]
    $Table
  )

  $cellCount = $Table.Range.Cells.Count
  for ($cellIndex = 1; $cellIndex -le $cellCount; $cellIndex += 1) {
    $cell = $Table.Range.Cells.Item($cellIndex)
    Set-CellSolidBorders -Cell $cell -Color $brandNavy -Width $wdLineWidth050pt
  }
}

function Set-CellBorderIfExists {
  param(
    [Parameter(Mandatory = $true)]
    $Table,

    [Parameter(Mandatory = $true)]
    [int]$RowIndex,

    [Parameter(Mandatory = $true)]
    [int]$ColumnIndex,

    [Parameter(Mandatory = $true)]
    [int]$BorderType,

    [Parameter(Mandatory = $true)]
    [int]$Color,

    [Parameter(Mandatory = $true)]
    [int]$Width
  )

  try {
    Set-CellBorder -Cell $Table.Cell($RowIndex, $ColumnIndex) -BorderType $BorderType -Color $Color -Width $Width
  }
  catch {
    # Vertically merged cells may not be addressable by row/column.
  }
}

function Set-TotalSeparatorBorders {
  param(
    [Parameter(Mandatory = $true)]
    $Table,

    [Parameter(Mandatory = $true)]
    [int]$LastDataRowIndex,

    [Parameter(Mandatory = $true)]
    [int]$TotalRowIndex,

    [Parameter(Mandatory = $true)]
    [int]$ColumnCount
  )

  for ($columnIndex = 1; $columnIndex -le $ColumnCount; $columnIndex += 1) {
    Set-CellBorderIfExists -Table $Table -RowIndex $LastDataRowIndex -ColumnIndex $columnIndex -BorderType $wdBorderBottom -Color $brandNavy -Width $wdLineWidth075pt
    Set-CellBorderIfExists -Table $Table -RowIndex $TotalRowIndex -ColumnIndex $columnIndex -BorderType $wdBorderTop -Color $brandNavy -Width $wdLineWidth075pt
  }
}

function Set-ColumnSeparatorBorders {
  param(
    [Parameter(Mandatory = $true)]
    $Table,

    [Parameter(Mandatory = $true)]
    [int]$RowCount,

    [Parameter(Mandatory = $true)]
    [int]$ColumnCount
  )

  for ($rowIndex = 1; $rowIndex -le $RowCount; $rowIndex += 1) {
    for ($columnIndex = 1; $columnIndex -lt $ColumnCount; $columnIndex += 1) {
      Set-CellBorderIfExists -Table $Table -RowIndex $rowIndex -ColumnIndex $columnIndex -BorderType $wdBorderRight -Color $brandNavy -Width $wdLineWidth075pt
      Set-CellBorderIfExists -Table $Table -RowIndex $rowIndex -ColumnIndex ($columnIndex + 1) -BorderType $wdBorderLeft -Color $brandNavy -Width $wdLineWidth075pt
    }
  }
}

function Set-TableSolidBorders {
  param(
    [Parameter(Mandatory = $true)]
    $Table
  )

  foreach ($borderType in @(
    $wdBorderTop,
    $wdBorderLeft,
    $wdBorderBottom,
    $wdBorderRight,
    $wdBorderHorizontal,
    $wdBorderVertical,
    $wdBorderDiagonalDown,
    $wdBorderDiagonalUp
  )) {
    Clear-TableBorder -Table $Table -BorderType $borderType
  }

  $Table.Borders.Enable = 0
  try {
    $Table.AllowSpacingBetweenCells = $true
  }
  catch {
    # Older Word COM versions may not expose this property.
  }
  $Table.Spacing = 1
  $Table.Shading.BackgroundPatternColor = $brandNavy
}

function Get-AmountHeaderText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Title,

    [int]$AmountColumnCount
  )

  $normalized = $Title.Trim()
  if ($AmountColumnCount -eq 1 -and $normalized -match "(?i)^(amount|monto)\s*1$") {
    return $Matches[1]
  }

  return $normalized
}

function Get-ServicesTitle {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Language
  )

  if ($Language -eq "en") {
    return "SERVICES"
  }

  return "SERVICIOS"
}

function Set-PageNumberFooter {
  param(
    [Parameter(Mandatory = $true)]
    $Word,

    [Parameter(Mandatory = $true)]
    $Document
  )

  $footerRange = $Document.Sections.Item(1).Footers.Item($wdHeaderFooterPrimary).Range
  $footerRange.Text = ""
  $footerRange.ParagraphFormat.Alignment = $wdAlignParagraphCenter
  $footerRange.Font.Name = "Aptos"
  $footerRange.Font.Size = 8.5
  $footerRange.Font.Bold = 0
  $footerRange.Font.Color = $textMuted

  $pageRange = $Document.Sections.Item(1).Footers.Item($wdHeaderFooterPrimary).Range.Duplicate
  $pageRange.Collapse($wdCollapseEnd)
  [void]$Document.Sections.Item(1).Footers.Item($wdHeaderFooterPrimary).Range.Fields.Add($pageRange, -1, "PAGE", $false)

  $textRange = $Document.Sections.Item(1).Footers.Item($wdHeaderFooterPrimary).Range.Duplicate
  $textRange.Collapse($wdCollapseEnd)
  $textRange.InsertAfter(" de ")
  $textRange.Collapse($wdCollapseEnd)
  [void]$Document.Sections.Item(1).Footers.Item($wdHeaderFooterPrimary).Range.Fields.Add($textRange, -1, "NUMPAGES", $false)
}

function Get-PlainCellText {
  param(
    [AllowNull()]
    $Value,

    [string]$Fallback = "-"
  )

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $Fallback
  }

  return $text.Trim()
}

function Get-OptionalPropertyValue {
  param(
    [Parameter(Mandatory = $true)]
    $Object,

    [Parameter(Mandatory = $true)]
    [string]$PropertyName,

    [AllowNull()]
    $Fallback = $null
  )

  if ($null -eq $Object -or $null -eq $Object.PSObject.Properties[$PropertyName]) {
    return $Fallback
  }

  return $Object.PSObject.Properties[$PropertyName].Value
}

function Get-AmountCellText {
  param(
    [AllowNull()]
    $Value,

    [string]$Mode,

    [string]$Fallback = "-"
  )

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $Fallback
  }

  if ($Mode -eq "FIXED") {
    $parsed = 0.0
    if ([double]::TryParse($text.Replace(",", ""), [ref]$parsed)) {
      return Format-Mxn -Value $parsed
    }

    return $Fallback
  }

  return $text.Trim()
}

function Set-TableColumnWidths {
  param(
    [Parameter(Mandatory = $true)]
    $Table,

    [int]$AmountColumnCount
  )

  if ($AmountColumnCount -ge 2) {
    $conceptWidth = 120
    $amountWidth = 70
    $paymentWidth = 104
    $notesWidth = 104
  }
  else {
    $conceptWidth = 160
    $amountWidth = 90
    $paymentWidth = 109
    $notesWidth = 109
  }

  $columnIndex = 1
  $Table.Columns.Item($columnIndex).Width = $conceptWidth
  $columnIndex += 1

  for ($amountIndex = 0; $amountIndex -lt $AmountColumnCount; $amountIndex += 1) {
    $Table.Columns.Item($columnIndex).Width = $amountWidth
    $columnIndex += 1
  }

  $Table.Columns.Item($columnIndex).Width = $paymentWidth
  $columnIndex += 1
  $Table.Columns.Item($columnIndex).Width = $notesWidth
}

function Get-QuoteTableWidth {
  return 468
}

function Merge-ExportCellRange {
  param(
    [Parameter(Mandatory = $true)]
    $Table,

    [int]$StartRow,
    [int]$ColumnIndex,
    [int]$RowSpan
  )

  if ($RowSpan -le 1) {
    return
  }

  $endRow = $StartRow + $RowSpan - 1
  $Table.Cell($StartRow, $ColumnIndex).Merge($Table.Cell($endRow, $ColumnIndex))
}

$payload = Get-Content -LiteralPath $QuoteJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$tableRows = @($payload.tableRows)
$amountColumns = @($payload.amountColumns)
$amountSummaries = @($payload.amountSummaries)

if ($tableRows.Count -eq 0) {
  throw "La cotizacion no tiene una tabla para exportar."
}

$hasSummaryRow = $false
foreach ($summary in $amountSummaries) {
  if ($null -ne $summary) {
    $hasSummaryRow = $true
    break
  }
}

$tableHeaderRowIndex = 1
$tableDataStartRowIndex = 2
$rowCount = 1 + $tableRows.Count + ($(if ($hasSummaryRow) { 1 } else { 0 }))
$columnCount = 1 + $amountColumns.Count + 2
$paymentColumnIndex = 2 + $amountColumns.Count
$notesColumnIndex = $paymentColumnIndex + 1

$word = $null
$document = $null

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  $document = $word.Documents.Open($TemplatePath, $false, $false)
  $document.SaveAs2($WordOutputPath, $wdFormatDocumentDefault)

  $bodyStart = $document.Content.Start
  $bodyEnd = $document.Content.End - 1
  if ($bodyEnd -gt $bodyStart) {
    $document.Range($bodyStart, $bodyEnd).Text = ""
  }
  Set-DocumentDefaults -Document $document

  $selection = $word.Selection
  $selection.SetRange($document.Content.Start, $document.Content.Start)

  Add-Paragraph -Selection $selection -Text ([string]$payload.formattedDate) -Alignment $wdAlignParagraphRight -FontSize 9.5 -SpaceAfter 4 -FontColor $textMuted
  Add-Paragraph -Selection $selection -Text ("{0}: {1}" -f ([string]$payload.quoteNumberLabel).ToUpperInvariant(), [string]$payload.quoteNumber) -Alignment $wdAlignParagraphRight -FontSize 11.5 -Bold $true -SpaceAfter 22 -FontColor $brandNavy -CharacterSpacing 0.25
  $presentText = [string](Get-OptionalPropertyValue -Object $payload -PropertyName "presentText" -Fallback "")
  $hasPresentText = -not [string]::IsNullOrWhiteSpace($presentText)
  Add-Paragraph -Selection $selection -Text ([string]$payload.clientName).ToUpperInvariant() -Alignment $wdAlignParagraphLeft -FontSize 11.5 -Bold $true -SpaceAfter $(if ($hasPresentText) { 4 } else { 16 }) -FontColor $brandNavy -CharacterSpacing 0.2
  if ($hasPresentText) {
    Add-Paragraph -Selection $selection -Text $presentText -Alignment $wdAlignParagraphLeft -FontSize 10.5 -SpaceAfter 18 -FontColor $textCharcoal -CharacterSpacing 1.4
  }
  Add-Paragraph -Selection $selection -Text ([string]$payload.introText) -Alignment $wdAlignParagraphJustify -FontSize 10.5 -SpaceAfter 16 -FontColor $textCharcoal

  $titleTable = $document.Tables.Add($selection.Range, 1, 1)
  Set-TableStyle -Table $titleTable
  $titleTable.Columns.Item(1).Width = Get-QuoteTableWidth
  $titleTable.Rows.Item(1).Height = 26
  Set-CellText -Cell $titleTable.Cell(1, 1) -Text (Get-ServicesTitle -Language ([string]$payload.language)) -Alignment $wdAlignParagraphCenter -Bold $true -FontSize 10 -FillColor $tableTitleFill -FontColor $tableWhiteText
  Set-TableSolidBorders -Table $titleTable

  $selection.SetRange($titleTable.Range.End, $titleTable.Range.End)
  $selection.ParagraphFormat.SpaceBefore = 0
  $selection.ParagraphFormat.SpaceAfter = 0
  $selection.Font.Size = 1
  $selection.TypeParagraph()

  $table = $document.Tables.Add($selection.Range, $rowCount, $columnCount)
  Set-TableStyle -Table $table
  Set-TableColumnWidths -Table $table -AmountColumnCount $amountColumns.Count

  Set-CellText -Cell $table.Cell($tableHeaderRowIndex, 1) -Text ([string]$payload.conceptHeader) -Alignment $wdAlignParagraphCenter -Bold $true -FontSize 8.5 -FillColor $tableHeaderFill -FontColor $brandNavy
  for ($amountIndex = 0; $amountIndex -lt $amountColumns.Count; $amountIndex += 1) {
    $amountHeaderText = Get-AmountHeaderText -Title ([string]$amountColumns[$amountIndex].title) -AmountColumnCount $amountColumns.Count
    Set-CellText -Cell $table.Cell($tableHeaderRowIndex, 2 + $amountIndex) -Text $amountHeaderText.ToUpperInvariant() -Alignment $wdAlignParagraphCenter -Bold $true -FontSize 8.5 -FillColor $tableHeaderFill -FontColor $brandNavy
  }
  Set-CellText -Cell $table.Cell($tableHeaderRowIndex, $paymentColumnIndex) -Text ([string]$payload.paymentHeader) -Alignment $wdAlignParagraphCenter -Bold $true -FontSize 8.5 -FillColor $tableHeaderFill -FontColor $brandNavy
  Set-CellText -Cell $table.Cell($tableHeaderRowIndex, $notesColumnIndex) -Text ([string]$payload.notesHeader) -Alignment $wdAlignParagraphCenter -Bold $true -FontSize 8.5 -FillColor $tableHeaderFill -FontColor $brandNavy

  for ($rowIndex = 0; $rowIndex -lt $tableRows.Count; $rowIndex += 1) {
    $tableRowIndex = $rowIndex + $tableDataStartRowIndex
    $row = $tableRows[$rowIndex]
    $table.Rows.Item($tableRowIndex).Height = 26

    Set-CellText -Cell $table.Cell($tableRowIndex, 1) -Text (Get-PlainCellText -Value $row.conceptDescription -Fallback ("Concepto {0}" -f ($rowIndex + 1))) -Alignment $wdAlignParagraphJustify -FontSize 9.2 -FillColor $tableConceptFill -FontColor $textCharcoal

    for ($amountIndex = 0; $amountIndex -lt $amountColumns.Count; $amountIndex += 1) {
      $columnIndex = 2 + $amountIndex
      $amountCell = $row.amountCells[$amountIndex]
      if ($null -eq $amountCell -or [bool]$amountCell.hidden) {
        Set-CellText -Cell $table.Cell($tableRowIndex, $columnIndex) -Text "" -Alignment $wdAlignParagraphCenter -FontSize 9.2
        continue
      }

      Set-CellText -Cell $table.Cell($tableRowIndex, $columnIndex) -Text (Get-AmountCellText -Value $amountCell.value -Mode ([string]$amountColumns[$amountIndex].mode) -Fallback ([string]$payload.emptyCellLabel)) -Alignment $wdAlignParagraphCenter -FontSize 9.2 -Bold $true -FontColor $brandNavy
    }

    if (-not [bool]$row.paymentMoment.hidden) {
      Set-CellText -Cell $table.Cell($tableRowIndex, $paymentColumnIndex) -Text (Get-PlainCellText -Value $row.paymentMoment.value -Fallback ([string]$payload.emptyCellLabel)) -Alignment $wdAlignParagraphCenter -FontSize 9 -FontColor $textCharcoal
    }
    else {
      Set-CellText -Cell $table.Cell($tableRowIndex, $paymentColumnIndex) -Text "" -Alignment $wdAlignParagraphCenter -FontSize 9
    }

    if (-not [bool]$row.notesCell.hidden) {
      Set-CellText -Cell $table.Cell($tableRowIndex, $notesColumnIndex) -Text (Get-PlainCellText -Value $row.notesCell.value -Fallback ([string]$payload.emptyCellLabel)) -Alignment $wdAlignParagraphCenter -FontSize 9 -FontColor $textCharcoal
    }
    else {
      Set-CellText -Cell $table.Cell($tableRowIndex, $notesColumnIndex) -Text "" -Alignment $wdAlignParagraphCenter -FontSize 9
    }
  }

  if ($hasSummaryRow) {
    $totalRowIndex = $tableRows.Count + $tableDataStartRowIndex
    $table.Rows.Item($totalRowIndex).Height = 22
    Set-CellText -Cell $table.Cell($totalRowIndex, 1) -Text ([string]$payload.totalLabel) -Alignment $wdAlignParagraphCenter -Bold $true -FontSize 8.8 -FillColor $tableTotalLabelFill -FontColor $brandNavy

    for ($amountIndex = 0; $amountIndex -lt $amountColumns.Count; $amountIndex += 1) {
      $summary = $amountSummaries[$amountIndex]
      $summaryText = if ($null -eq $summary) {
        [string]$payload.emptyCellLabel
      }
      else {
        Format-Mxn -Value ([double]$summary)
      }

      Set-CellText -Cell $table.Cell($totalRowIndex, 2 + $amountIndex) -Text $summaryText -Alignment $wdAlignParagraphCenter -Bold $true -FontSize 9.2 -FillColor $tableTotalAmountFill -FontColor $brandNavy
    }

    Set-CellText -Cell $table.Cell($totalRowIndex, $paymentColumnIndex) -Text "" -Alignment $wdAlignParagraphCenter -Bold $true -FillColor $tableBlackFill -FontColor $tableWhiteText
    Set-CellText -Cell $table.Cell($totalRowIndex, $notesColumnIndex) -Text "" -Alignment $wdAlignParagraphCenter -Bold $true -FillColor $tableBlackFill -FontColor $tableWhiteText
  }

  for ($rowIndex = $tableRows.Count - 1; $rowIndex -ge 0; $rowIndex -= 1) {
    $tableRowIndex = $rowIndex + $tableDataStartRowIndex
    $row = $tableRows[$rowIndex]

    for ($amountIndex = $amountColumns.Count - 1; $amountIndex -ge 0; $amountIndex -= 1) {
      $amountCell = $row.amountCells[$amountIndex]
      if ($null -ne $amountCell -and -not [bool]$amountCell.hidden) {
        Merge-ExportCellRange -Table $table -StartRow $tableRowIndex -ColumnIndex (2 + $amountIndex) -RowSpan ([int]$amountCell.rowSpan)
      }
    }

    if (-not [bool]$row.paymentMoment.hidden) {
      Merge-ExportCellRange -Table $table -StartRow $tableRowIndex -ColumnIndex $paymentColumnIndex -RowSpan ([int]$row.paymentMoment.rowSpan)
    }

    if (-not [bool]$row.notesCell.hidden) {
      Merge-ExportCellRange -Table $table -StartRow $tableRowIndex -ColumnIndex $notesColumnIndex -RowSpan ([int]$row.notesCell.rowSpan)
    }
  }

  $selection.SetRange($table.Range.End, $table.Range.End)
  $selection.TypeParagraph()

  Add-Paragraph -Selection $selection -Text ([string]$payload.disclaimerText) -Alignment $wdAlignParagraphJustify -FontSize 10.2 -SpaceAfter 12 -SpaceBefore 10 -FontColor $textCharcoal
  Add-Paragraph -Selection $selection -Text ([string]$payload.closingText) -Alignment $wdAlignParagraphJustify -FontSize 10.2 -SpaceAfter 22 -FontColor $textCharcoal
  Add-Paragraph -Selection $selection -Text ([string]$payload.signatureText) -Alignment $wdAlignParagraphCenter -FontSize 10.5 -SpaceAfter 8 -FontColor $textCharcoal
  Add-Paragraph -Selection $selection -Text ([string]$payload.signatureFirm) -Alignment $wdAlignParagraphCenter -FontSize 10.5 -Bold $true -SpaceAfter 0 -FontColor $brandNavy -CharacterSpacing 0.3

  Set-PageNumberFooter -Word $word -Document $document
  [void]$document.Fields.Update()
  [void]$document.Sections.Item(1).Footers.Item($wdHeaderFooterPrimary).Range.Fields.Update()
  $document.Save()

  if ($PdfOutputPath) {
    $document.ExportAsFixedFormat($PdfOutputPath, $wdExportFormatPdf)
  }
}
finally {
  if ($document) {
    try {
      $document.Close([ref]$false)
    }
    catch {
      # Ignored: Word can disconnect COM clients after closing/exporting.
    }
  }

  if ($word) {
    try {
      $word.Quit()
    }
    catch {
      # Ignored: Word can disconnect COM clients after closing/exporting.
    }
  }
}
