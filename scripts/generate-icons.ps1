Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path $PSScriptRoot '../public/icons'
New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null
foreach ($iconSize in @(180, 192, 512)) {
  $bitmap = [System.Drawing.Bitmap]::new($iconSize, $iconSize)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $font = [System.Drawing.Font]::new('Segoe UI', [single]($iconSize * 0.5), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $format = [System.Drawing.StringFormat]::new()
  try {
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#24684f'))
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString('W', $font, $brush, [System.Drawing.RectangleF]::new(0, 0, $iconSize, $iconSize), $format)
    $bitmap.Save((Join-Path $iconDirectory "wordsteps-$iconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $format.Dispose(); $brush.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
