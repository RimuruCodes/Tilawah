import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Mic, BarChart3, Heart, Users, Globe, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function About() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-8">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-slate-500">Back to Home</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <BookOpen className="w-7 h-7 text-emerald-400" />
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            About <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">Quran Companion</span>
          </h1>

          <div className="space-y-4 text-slate-400 leading-relaxed">
            <p>
              Quran Companion is a modern, thoughtfully designed platform built to help Muslims around the world read, listen to, memorize, and perfect their recitation of the Holy Quran. We combine beautiful Uthmani typography, professional audio from world-renowned reciters, and AI-powered voice analysis into a single, focused experience that adapts to each learner's pace.
            </p>
            <p>
              The app is for everyone on the journey of memorization — whether you are a beginner taking your first steps with short surahs, a student working through Juz Amma, or an experienced hafiz refining your Tajweed. Teachers can use it to assign and track practice, parents can follow their children's daily streaks, and busy professionals can fit a few verses into a lunch break. Active Recall mode hides verses to test your memory, while the weekly heatmap and milestone rewards keep motivation high through the principles of spaced repetition and gentle gamification.
            </p>
            <p>
              Quran Companion is built and maintained by a small, independent team of developers and Quran students who believe that high-quality Islamic learning tools should be free, accessible, and respectful. Audio is streamed from EveryAyah.com and text from the Al Quran Cloud API. We are not affiliated with any organization — this is a community project, sustained by donations and driven by the intention to make the path of memorization a little easier for the Ummah.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 pt-2">
            {[
              { icon: <Mic className="w-5 h-5" />, title: "AI Voice Analysis", desc: "Record and get instant Tajweed feedback" },
              { icon: <BarChart3 className="w-5 h-5" />, title: "Progress Tracking", desc: "Streaks, heatmaps, and milestones" },
              { icon: <Users className="w-5 h-5" />, title: "For All Levels", desc: "From beginners to experienced hafiz" },
              { icon: <Globe className="w-5 h-5" />, title: "Free & Open", desc: "Accessible to learners worldwide" }
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="p-4 rounded-2xl bg-slate-900/50 border border-slate-700/20"
              >
                <div className="text-emerald-400 mb-2">{item.icon}</div>
                <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Link
              to="/contact"
              className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-900 text-sm font-medium hover:bg-emerald-400 transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Get in Touch
            </Link>
            <Link
              to="/donate"
              className="px-5 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors flex items-center gap-2 border border-emerald-500/20"
            >
              <Heart className="w-4 h-4" />
              Support Us
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}