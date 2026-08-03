/**
 * SparkLine — minimal pure-SVG inline line chart.
 *
 * No dependencies. Renders a stroke + dots + optional area fill across
 * normalised values. Ideal for price/cost-history mini-charts in
 * Product 360 and elsewhere.
 */

export type SparkPoint = {
  x: string | number;
  y: number;
};

export type SparkLineProps = {
  points: SparkPoint[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  showDots?: boolean;
  /** Optional rendering label for accessibility. */
  ariaLabel?: string;
};

export function SparkLine({
  points,
  width = 240,
  height = 56,
  stroke = "#ea580c",
  fill = "rgba(234, 88, 12, 0.08)",
  showDots = true,
  ariaLabel,
}: SparkLineProps) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ width, height }}
      >
        no data
      </div>
    );
  }

  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || 1;

  const padX = 4;
  const padY = 6;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const coords = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * innerW;
    const y = padY + (1 - (p.y - minY) / span) * innerH;
    return { x, y, label: String(p.x), value: p.y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${height - padY} L${coords[0].x},${height - padY} Z`;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel ?? "sparkline"}
      className="overflow-visible"
    >
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
      {showDots
        ? coords.map((c, i) => (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r={2.5} fill="white" stroke={stroke} strokeWidth={1.5} />
              <title>
                {c.label}: {c.value.toFixed(3)}
              </title>
            </g>
          ))
        : null}
    </svg>
  );
}
