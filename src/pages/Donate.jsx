import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Users, Globe, Heart } from "lucide-react";
import { motion } from "framer-motion";
import DonationCard from "@/components/quran/DonationCard";

export default function Donate() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-8">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-white">Support Quran Companion</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 py-6"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <Heart className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">Help Keep Learning Free</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
            Your generous donations help us maintain servers, improve AI models, and keep this platform accessible to learners worldwide — completely free of charge.
          </p>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: <BookOpen className="w-6 h-6" />, title: "Free Access", desc: "Keep Quran learning free for millions" },
            { icon: <Users className="w-6 h-6" />, title: "Community", desc: "Support learners from every background" },
            { icon: <Globe className="w-6 h-6" />, title: "Global Reach", desc: "Expand to more languages and reciters" }
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="text-center p-5 rounded-2xl bg-slate-900/50 border border-slate-700/20"
            >
              <div className="text-emerald-400 mb-3 inline-block">{item.icon}</div>
              <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
              <p className="text-xs text-slate-500">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        <DonationCard />
      </div>
    </div>
  );
}