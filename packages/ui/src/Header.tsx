"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Search } from "lucide-react";

const NAV_ITEMS = [
  { label: "首页", path: "/" },
  { label: "分类浏览", path: "/browse" },
  { label: "地区浏览", path: "/regions" },
  { label: "关于", path: "/about" },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-b border-rice-300">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="w-8 h-8 bg-vermilion-500 rounded-lg flex items-center justify-center text-white text-sm font-bold group-hover:bg-vermilion-600 transition-colors">
            摩
          </span>
          <span className="font-serif text-lg text-ink-600 font-semibold hidden sm:block">
            摩崖碑刻数字平台
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                pathname === item.path
                  ? "bg-vermilion-50 text-vermilion-500"
                  : "text-ink-500 hover:bg-rice-200 hover:text-ink-700"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/search"
            className="ml-2 px-4 py-2 rounded-lg bg-vermilion-500 text-white text-sm font-medium hover:bg-vermilion-600 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Search size={16} />
            搜索
          </Link>
        </nav>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-ink-500 hover:text-ink-700 cursor-pointer"
          aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-rice-300 bg-white animate-slide-in-up">
          <div className="px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setMobileOpen(false)}
                className={`block px-4 py-3 rounded-lg text-base font-medium ${
                  pathname === item.path
                    ? "bg-vermilion-50 text-vermilion-500"
                    : "text-ink-500 hover:bg-rice-200"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/search"
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-3 rounded-lg bg-vermilion-500 text-white text-base font-medium text-center mt-2"
            >
              <Search size={18} className="inline mr-2" />
              搜索碑刻
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
