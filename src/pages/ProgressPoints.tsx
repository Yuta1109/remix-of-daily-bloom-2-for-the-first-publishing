import { ChevronLeft } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useI18n } from "@/lib/i18n";
import { todayLocalDate } from "@/lib/v3/local-date";
import { getPointBalance, getPointTransactions } from "@/lib/v3/repository";
import { pointSeriesFromTransactions } from "@/lib/v3/points-series";

const cumulativeConfig = {
  cumulative: { label: "cumulative", color: "hsl(var(--accent))" },
} satisfies ChartConfig;

const dailyConfig = {
  earned: { label: "earned", color: "hsl(var(--accent))" },
} satisfies ChartConfig;

export default function ProgressPoints() {
  const { t, formatDateStr } = useI18n();
  const navigate = useNavigate();
  const today = todayLocalDate();
  const series = useMemo(
    () => pointSeriesFromTransactions(getPointTransactions(), today),
    [today],
  );
  const balance = getPointBalance();
  const chartData = series.map((row) => ({
    ...row,
    label: formatDateStr(row.date, { month: "numeric", day: "numeric" }),
  }));

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-4 pb-2">
        <button
          type="button"
          onClick={() => navigate("/progress")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("back")}
        </button>
        <h1 className="text-[28px] font-bold tracking-tight">{t("progressPointsDetailTitle")}</h1>
      </div>
      <div className="app-shell-scroll px-4 pb-8 space-y-4">
        <div className="rounded-2xl bg-card shadow-soft px-4 py-3" data-testid="progress-points-balance">
          <p className="text-sm text-muted-foreground">{t("progressPointsCurrent")}</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            {balance} {t("progressPts")}
          </p>
        </div>

        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("progressPointsEmpty")}</p>
        ) : (
          <>
            <section className="rounded-2xl bg-card shadow-soft px-3 py-3" data-testid="points-cumulative-chart">
              <h2 className="text-sm font-semibold px-1 mb-2">{t("progressPointsCumulative")}</h2>
              <ChartContainer config={cumulativeConfig} className="aspect-[16/9]">
                <LineChart data={chartData}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    stroke="var(--color-cumulative)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </section>

            <section className="rounded-2xl bg-card shadow-soft px-3 py-3" data-testid="points-daily-chart">
              <h2 className="text-sm font-semibold px-1 mb-2">{t("progressPointsDailyEarned")}</h2>
              <ChartContainer config={dailyConfig} className="aspect-[16/9]">
                <BarChart data={chartData}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="earned" fill="var(--color-earned)" radius={4} />
                </BarChart>
              </ChartContainer>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
