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
    [int]$SpaceBefore = 0
  )

  $Selection.ParagraphFormat.Alignment = $Alignment
  $Selection.ParagraphFormat.SpaceAfter = $SpaceAfter
  $Selection.ParagraphFormat.SpaceBefore = $SpaceBefore
  $Selection.Font.Name = "Aptos"
  $Selection.Font.Size = $FontSize
  $Selection.Font.Bold = if ($Bold) { 1 } else { 0 }
  $Selection.Font.Color = 0
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
    [double]$FontSize = 9.5
  )

  $Cell.Range.Text = $Text
  $Cell.Range.ParagraphFormat.Alignment = $Alignment
  $Cell.Range.ParagraphFormat.SpaceAfter = 0
  $Cell.Range.ParagraphFormat.SpaceBefore = 0
  $Cell.Range.Font.Name = "Aptos"
  $Cell.Range.Font.Size = $FontSize
  $Cell.Range.Font.Bold = if ($Bold) { 1 } else { 0 }
  $Cell.Range.Font.Color = 0
  $Cell.VerticalAlignment = $wdCellAlignVerticalCenter
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
  $footerRange.Font.Size = 10
  $footerRange.Font.Bold = 0
  $footerRange.Font.Color = 0

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

  $selection = $word.Selection
  $selection.SetRange($document.Content.Start, $document.Content.Start)

  Add-Paragraph -Selection $selection -Text ([string]$payload.formattedDate) -Alignment $wdAlignParagraphRight -FontSize 10.5 -SpaceAfter 10
  Add-Paragraph -Selection $selection -Text ("{0}: {1}" -f [string]$payload.quoteNumberLabel, [string]$payload.quoteNumber) -Alignment $wdAlignParagraphCenter -FontSize 16 -Bold $true -SpaceAfter 14
  Add-Paragraph -Selection $selection -Text ([string]$payload.clientName).ToUpperInvariant() -Alignment $wdAlignParagraphLeft -FontSize 12 -Bold $true -SpaceAfter 14
  Add-Paragraph -Selection $selection -Text ([string]$payload.introText) -Alignment $wdAlignParagraphJustify -FontSize 11 -SpaceAfter 14

  $table = $document.Tables.Add($selection.Range, $rowCount, $columnCount)
  $table.AllowAutoFit = $false
  $table.Borders.Enable = 1
  Set-TableColumnWidths -Table $table -AmountColumnCount $amountColumns.Count

  Set-CellText -Cell $table.Cell(1, 1) -Text ([string]$payload.conceptHeader) -Alignment $wdAlignParagraphCenter -Bold $true
  for ($amountIndex = 0; $amountIndex -lt $amountColumns.Count; $amountIndex += 1) {
    Set-CellText -Cell $table.Cell(1, 2 + $amountIndex) -Text ([string]$amountColumns[$amountIndex].title).ToUpperInvariant() -Alignment $wdAlignParagraphCenter -Bold $true
  }
  Set-CellText -Cell $table.Cell(1, $paymentColumnIndex) -Text ([string]$payload.paymentHeader) -Alignment $wdAlignParagraphCenter -Bold $true
  Set-CellText -Cell $table.Cell(1, $notesColumnIndex) -Text ([string]$payload.notesHeader) -Alignment $wdAlignParagraphCenter -Bold $true

  for ($rowIndex = 0; $rowIndex -lt $tableRows.Count; $rowIndex += 1) {
    $tableRowIndex = $rowIndex + 2
    $row = $tableRows[$rowIndex]

    Set-CellText -Cell $table.Cell($tableRowIndex, 1) -Text (Get-PlainCellText -Value $row.conceptDescription -Fallback ("Concepto {0}" -f ($rowIndex + 1))) -Alignment $wdAlignParagraphLeft

    for ($amountIndex = 0; $amountIndex -lt $amountColumns.Count; $amountIndex += 1) {
      $columnIndex = 2 + $amountIndex
      $amountCell = $row.amountCells[$amountIndex]
      if ($null -eq $amountCell -or [bool]$amountCell.hidden) {
        Set-CellText -Cell $table.Cell($tableRowIndex, $columnIndex) -Text "" -Alignment $wdAlignParagraphCenter
        continue
      }

      Set-CellText -Cell $table.Cell($tableRowIndex, $columnIndex) -Text (Get-AmountCellText -Value $amountCell.value -Mode ([string]$amountColumns[$amountIndex].mode) -Fallback ([string]$payload.emptyCellLabel)) -Alignment $wdAlignParagraphCenter
    }

    if (-not [bool]$row.paymentMoment.hidden) {
      Set-CellText -Cell $table.Cell($tableRowIndex, $paymentColumnIndex) -Text (Get-PlainCellText -Value $row.paymentMoment.value -Fallback ([string]$payload.emptyCellLabel)) -Alignment $wdAlignParagraphCenter
    }
    else {
      Set-CellText -Cell $table.Cell($tableRowIndex, $paymentColumnIndex) -Text "" -Alignment $wdAlignParagraphCenter
    }

    if (-not [bool]$row.notesCell.hidden) {
      Set-CellText -Cell $table.Cell($tableRowIndex, $notesColumnIndex) -Text (Get-PlainCellText -Value $row.notesCell.value -Fallback ([string]$payload.emptyCellLabel)) -Alignment $wdAlignParagraphCenter
    }
    else {
      Set-CellText -Cell $table.Cell($tableRowIndex, $notesColumnIndex) -Text "" -Alignment $wdAlignParagraphCenter
    }
  }

  for ($rowIndex = $tableRows.Count - 1; $rowIndex -ge 0; $rowIndex -= 1) {
    $tableRowIndex = $rowIndex + 2
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

  if ($hasSummaryRow) {
    $totalRowIndex = $tableRows.Count + 2
    Set-CellText -Cell $table.Cell($totalRowIndex, 1) -Text ([string]$payload.totalLabel) -Alignment $wdAlignParagraphCenter -Bold $true

    for ($amountIndex = 0; $amountIndex -lt $amountColumns.Count; $amountIndex += 1) {
      $summary = $amountSummaries[$amountIndex]
      $summaryText = if ($null -eq $summary) {
        [string]$payload.emptyCellLabel
      }
      else {
        Format-Mxn -Value ([double]$summary)
      }

      Set-CellText -Cell $table.Cell($totalRowIndex, 2 + $amountIndex) -Text $summaryText -Alignment $wdAlignParagraphCenter -Bold $true
    }

    Set-CellText -Cell $table.Cell($totalRowIndex, $paymentColumnIndex) -Text "" -Alignment $wdAlignParagraphCenter -Bold $true
    Set-CellText -Cell $table.Cell($totalRowIndex, $notesColumnIndex) -Text "" -Alignment $wdAlignParagraphCenter -Bold $true
  }

  $selection.SetRange($table.Range.End, $table.Range.End)
  $selection.TypeParagraph()

  Add-Paragraph -Selection $selection -Text ([string]$payload.disclaimerText) -Alignment $wdAlignParagraphJustify -FontSize 11 -SpaceAfter 12
  Add-Paragraph -Selection $selection -Text ([string]$payload.closingText) -Alignment $wdAlignParagraphJustify -FontSize 11 -SpaceAfter 18
  Add-Paragraph -Selection $selection -Text ([string]$payload.signatureText) -Alignment $wdAlignParagraphCenter -FontSize 11 -SpaceAfter 8
  Add-Paragraph -Selection $selection -Text ([string]$payload.signatureFirm) -Alignment $wdAlignParagraphCenter -FontSize 11 -Bold $true -SpaceAfter 0

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
