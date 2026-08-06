"use client";

import { BookOpen, Shield, Users, Database } from 'lucide-react';
import AppLayout from '@/app/AppLayout';

export default function AboutPage() {
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="font-serif text-3xl md:text-4xl text-ink-600 font-bold mb-4">关于平台</h1>
        <p className="text-ink-400 text-lg mb-12 leading-relaxed">
          摩崖碑刻数字平台是一个面向公众的公益性数字化图志网站，
          致力于系统整理和展示中国各地的摩崖碑刻文化遗产。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <FeatureCard
            icon={<BookOpen size={24} />}
            title="文化传承"
            desc="收录中国各地摩崖碑刻资料，让千年石刻在数字世界焕发新生。"
          />
          <FeatureCard
            icon={<Database size={24} />}
            title="数据标准化"
            desc="统一的分类体系、字段规范和枚举值，确保数据质量和可检索性。"
          />
          <FeatureCard
            icon={<Shield size={24} />}
            title="版权尊重"
            desc="所有图片版权归原作者所有。平台内容仅供学术研究和文化传播。"
          />
          <FeatureCard
            icon={<Users size={24} />}
            title="开放共建"
            desc="欢迎提供碑刻资料和图片，共同完善中国摩崖碑刻的数字档案。"
          />
        </div>

        <div className="card-stone p-8 space-y-6">
          <h2 className="font-serif text-xl text-ink-600 font-semibold">数据与著录方法</h2>
          <div className="text-sm text-ink-500 leading-relaxed space-y-3">
            <p>
              <strong className="text-ink-600">点位定义：</strong>
              一处独立碑刻、一组在同一地点不可分割的刻石，或一个具有统一名称与位置的遗址单元。
            </p>
            <p>
              <strong className="text-ink-600">分类标准：</strong>
              朝代按历史时期划分（商→周→秦→汉→...→现代），
              类型分为摩崖题记、碑碣、造像题记、墓志铭、题名题记、刻经等。
              书体分为篆书、隶书、楷书、行书、草书等。
            </p>
            <p>
              <strong className="text-ink-600">图片策略：</strong>
              每张图片生成三种版本——缩略图(长边480-640px)、展示图(长边1800-2400px)、
              原图(仅归档不公开)，平衡加载速度与清晰度。
            </p>
            <p>
              <strong className="text-ink-600">坐标体系：</strong>
              使用WGS84坐标系。对于敏感点位，不公开精确坐标。
            </p>
            <p>
              <strong className="text-ink-600">搜索能力：</strong>
              支持碑刻名称、别名、地区、朝代、书体、书家等多维度检索。
              支持拼音首字母搜索和繁简体互通检索。
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="card-stone p-5">
      <div className="w-10 h-10 bg-vermilion-50 rounded-lg flex items-center justify-center text-vermilion-500 mb-3">
        {icon}
      </div>
      <h3 className="font-medium text-ink-600 mb-1">{title}</h3>
      <p className="text-sm text-ink-400 leading-relaxed">{desc}</p>
    </div>
  );
}
