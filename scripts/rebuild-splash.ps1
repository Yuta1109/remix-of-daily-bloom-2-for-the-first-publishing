# Rebuild iOS splash: Essences icon on #faf8f5 with a slightly-inset cream
# frame overlay so black icon corners / side slivers are hidden.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$IconPath = Join-Path $RepoRoot "ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png"
$SplashDir = Join-Path $RepoRoot "ios\App\App\Assets.xcassets\Splash.imageset"
$OutNames = @(
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png"
)

$Canvas = 2732
# One step smaller than the previous ~28% mark.
$IconDraw = [int][math]::Round($Canvas * 0.22)
# Frame slightly smaller than the icon — hides L/R black slivers + corner black.
$InsetRatio = 0.030
$Bg = [System.Drawing.Color]::FromArgb(255, 0xFA, 0xF8, 0xF5)

$iconImg = [System.Drawing.Image]::FromFile($IconPath)
try {
  $bmp = New-Object System.Drawing.Bitmap $Canvas, $Canvas
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.Clear($Bg)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $x = [int](($Canvas - $IconDraw) / 2)
    $y = $x
    $dest = New-Object System.Drawing.Rectangle $x, $y, $IconDraw, $IconDraw
    $g.DrawImage($iconImg, $dest)

    $inset = [int][math]::Max(8, [math]::Round($IconDraw * $InsetRatio))
    $rx = $x + $inset
    $ry = $y + $inset
    $rw = $IconDraw - 2 * $inset
    $rh = $IconDraw - 2 * $inset
    # iOS-like continuous corner; scale with the inset inner rect.
    $radius = [int][math]::Round($rw * 0.2237)
    $r = [int][math]::Min($radius, [math]::Floor([math]::Min($rw, $rh) / 2))
    $d = $r * 2

    $outerPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $innerPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $brush = New-Object System.Drawing.SolidBrush $Bg
    try {
      $outerPath.AddRectangle($dest)
      $innerPath.AddArc($rx, $ry, $d, $d, 180, 90)
      $innerPath.AddArc(($rx + $rw - $d), $ry, $d, $d, 270, 90)
      $innerPath.AddArc(($rx + $rw - $d), ($ry + $rh - $d), $d, $d, 0, 90)
      $innerPath.AddArc($rx, ($ry + $rh - $d), $d, $d, 90, 90)
      $innerPath.CloseFigure()

      # Cream "frame": icon square minus a slightly smaller rounded hole.
      $region = New-Object System.Drawing.Region $outerPath
      $region.Exclude($innerPath)
      $g.FillRegion($brush, $region)
      $region.Dispose()
    } finally {
      $brush.Dispose()
      $outerPath.Dispose()
      $innerPath.Dispose()
    }
  } finally {
    $g.Dispose()
  }

  foreach ($name in $OutNames) {
    $out = Join-Path $SplashDir $name
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Wrote $out"
  }
  $bmp.Dispose()
} finally {
  $iconImg.Dispose()
}

Write-Host "Splash rebuild done (icon=$IconDraw inset=$inset canvas=$Canvas bg=#faf8f5)"
