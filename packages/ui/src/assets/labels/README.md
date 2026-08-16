# Fixed label marks

Three bottom-navigation marks directly preserve the
user-provided 首页、碑刻、书帖 PNG pixels. Each source was trimmed at alpha 32,
cleared below that alpha, scaled proportionally, and centered on the same
transparent 264×120 canvas. No glyph was redrawn, vectorized, recolored, or
stretched. At runtime the PNG alpha is used as a CSS mask so the mark follows
the active navigation color in light and dark themes without exposing gray
source pixels. All other navigation labels, dynamic titles, and user content
remain system text.
