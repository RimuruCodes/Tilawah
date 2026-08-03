import React from "react";
import { motion } from "framer-motion";

export default function WeeklyHeatmap({ streaks }) {
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en', { weekday: 'short' });
    const streak = streaks.find(s => s.date === dateStr);
    last7Days.push({
      date: dateStr,
      day: dayName,
      recordings: streak?.total_recordings || 0,
      accuracy: streak?.average_accuracy || 0,
      isToday: i === 0
    });
  }

  const maxRecordings = Math.max(...last7Days.map(d => d.recordings), 1);

  return (
    <div className="bg-ink-surface/60 border border-ink-border/60 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-ink-text-2 mb-4">This Week</h3>
      <div className="flex items-end gap-2 h-24">
        {last7Days.map((day, i) => {
          const height = day.recordings > 0 ? Math.max(20, (day.recordings / maxRecordings) * 100) : 8;
          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
                className={`w-full rounded-lg transition-colors ${
                  day.recordings > 0
                    ? day.isToday
                      ? 'bg-ink-accent shadow-ink'
                      : 'bg-ink-accent/40'
                    : 'bg-ink-surface-2'
                }`}
                title={`${day.recordings} recordings${day.accuracy ? `, ${day.accuracy}% avg` : ''}`}
              />
              <span className={`text-[10px] ${day.isToday ? 'text-ink-accent font-semibold' : 'text-ink-text-3'}`}>
                {day.day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}