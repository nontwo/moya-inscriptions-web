"use client";

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-ink-700 text-rice-200 mt-20">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* 关于 */}
          <div>
            <h3 className="font-serif text-lg text-white mb-3">摩崖碑刻数字平台</h3>
            <p className="text-rice-300 text-sm leading-relaxed">
              致力于系统整理和展示中国各地的摩崖碑刻文化遗产，
              让千年石刻在数字世界中焕发新生。
            </p>
          </div>

          {/* 快速链接 */}
          <div>
            <h3 className="font-medium text-white mb-3">快速链接</h3>
            <div className="space-y-2 text-sm">
              <Link href="/browse" className="block text-rice-300 hover:text-white transition-colors">分类浏览</Link>
              <Link href="/regions" className="block text-rice-300 hover:text-white transition-colors">地区浏览</Link>
              <Link href="/about" className="block text-rice-300 hover:text-white transition-colors">关于平台</Link>
            </div>
          </div>

          {/* 声明 */}
          <div>
            <h3 className="font-medium text-white mb-3">版权声明</h3>
            <p className="text-rice-300 text-sm leading-relaxed">
              本站内容仅供学术研究和文化传播之用。
              图片版权归原作者所有，如需使用请联系我们。
            </p>
          </div>
        </div>

        <div className="border-t border-ink-500 mt-8 pt-6 text-center text-rice-400 text-xs">
          <p>&copy; {new Date().getFullYear()} 摩崖碑刻数字平台. 京ICP备XXXXXXXX号</p>
        </div>
      </div>
    </footer>
  );
}
