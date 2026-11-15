# Reproduce the wireframe LOGO() with Windows' built-in vector rasterizer.
# Run from any directory; no network or model files are involved.
Add-Type -AssemblyName System.Drawing
$resourceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../android/app/src/main/res'))
$ink = [System.Drawing.ColorTranslator]::FromHtml('#1f2d55')
$paper = [System.Drawing.ColorTranslator]::FromHtml('#fffdf9')
$amber = [System.Drawing.ColorTranslator]::FromHtml('#c8892b')
function Write-BrandImage([string]$path, [int]$width, [int]$height, [bool]$transparent, [bool]$round, [single]$logoSize) {
    $bitmap = [System.Drawing.Bitmap]::new($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $background = [System.Drawing.SolidBrush]::new($ink)
    if (-not $transparent) {
        if ($round) { $graphics.FillEllipse($background, 0, 0, $width, $height) }
        else { $graphics.Clear($ink) }
    }
    $graphics.TranslateTransform(($width - $logoSize) / 2, ($height - $logoSize) / 2)
    $graphics.ScaleTransform($logoSize / 48, $logoSize / 48)
    $paperPen = [System.Drawing.Pen]::new($paper, 3.2)
    $paperPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $paperPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $amberPen = [System.Drawing.Pen]::new($amber, 3.2)
    $amberPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $amberPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $paperBrush = [System.Drawing.SolidBrush]::new($paper)
    $amberBrush = [System.Drawing.SolidBrush]::new($amber)
    $graphics.DrawBezier($paperPen, 14, 30, 20, 14, 28, 14, 34, 30)
    $graphics.DrawLine($amberPen, 14, 30, 34, 30)
    $graphics.FillEllipse($paperBrush, 7, 23, 14, 14)
    $graphics.FillEllipse($background, 27, 23, 14, 14)
    $graphics.DrawEllipse($paperPen, 27, 23, 14, 14)
    $graphics.FillEllipse($amberBrush, [single]31.4, [single]27.4, [single]5.2, [single]5.2)
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose(); $bitmap.Dispose(); $paperPen.Dispose(); $amberPen.Dispose()
    $paperBrush.Dispose(); $amberBrush.Dispose(); $background.Dispose()
}
$densities = @{mdpi=1; hdpi=1.5; xhdpi=2; xxhdpi=3; xxxhdpi=4}
foreach ($density in $densities.Keys) {
    $scale = $densities[$density]
    $folder = Join-Path $resourceRoot "mipmap-$density"
    Write-BrandImage (Join-Path $folder 'ic_launcher.png') (48*$scale) (48*$scale) $false $false (36*$scale)
    Write-BrandImage (Join-Path $folder 'ic_launcher_round.png') (48*$scale) (48*$scale) $false $true (36*$scale)
    Write-BrandImage (Join-Path $folder 'ic_launcher_foreground.png') (108*$scale) (108*$scale) $true $false (72*$scale)
}
foreach ($file in (Get-ChildItem -LiteralPath $resourceRoot -Recurse -Filter splash.png)) {
    $old = [System.Drawing.Image]::FromFile($file.FullName)
    $width = $old.Width; $height = $old.Height; $old.Dispose()
    $density = if ($file.Directory.Name -match '(?:land|port)-(\w+)$') { $Matches[1] } else { 'mdpi' }
    Write-BrandImage $file.FullName $width $height $false $false (72*$densities[$density])
}
