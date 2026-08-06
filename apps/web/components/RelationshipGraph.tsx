import { useEffect, useRef, useState } from 'react';
import type { GraphData, GraphNode, Dynasty } from '@moya/contracts';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface RelationshipGraphProps {
  data: GraphData;
}

const COLORS: Record<string, string> = {
  '碑刻': '#C41E3A',
  '书家': '#1565C0',
  '作品': '#2E7D32',
};

export default function RelationshipGraph({ data }: RelationshipGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [scale, setScale] = useState(1);

  const nodes = data.nodes;
  const edges = data.edges;

  // 简单力导向布局
  const layout = useSimpleLayout(nodes, edges, 600, 400);

  const connectedNodes = selectedNode
    ? new Set(edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
        .flatMap((e) => [e.source, e.target]))
    : new Set<string>();

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setScale((s) => Math.min(s + 0.2, 2))} className="p-1.5 bg-white border border-rice-200 rounded hover:bg-rice-50 cursor-pointer">
          <ZoomIn size={14} />
        </button>
        <button onClick={() => setScale((s) => Math.max(s - 0.2, 0.5))} className="p-1.5 bg-white border border-rice-200 rounded hover:bg-rice-50 cursor-pointer">
          <ZoomOut size={14} />
        </button>
        <button onClick={() => { setScale(1); setSelectedNode(null); }} className="p-1.5 bg-white border border-rice-200 rounded hover:bg-rice-50 cursor-pointer">
          <RotateCcw size={14} />
        </button>
      </div>

      <div ref={containerRef} className="bg-rice-50 rounded-xl overflow-hidden border border-rice-200" style={{ height: 400 }}>
        <svg width="100%" height="100%" viewBox="0 0 600 400">
          <defs>
            {edges.map((e, i) => (
              <marker key={i} id={`arrow-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#B0B0B0" />
              </marker>
            ))}
          </defs>

          <g transform={`scale(${scale})`} style={{ transformOrigin: '300px 200px' }}>
            {/* 边 */}
            {edges.map((e, i) => {
              const from = layout.get(e.source);
              const to = layout.get(e.target);
              if (!from || !to) return null;
              const isConnected = selectedNode && (e.source === selectedNode.id || e.target === selectedNode.id);
              return (
                <g key={i}>
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={isConnected ? '#C41E3A' : '#D1D1D1'}
                    strokeWidth={isConnected ? 2 : 1}
                    markerEnd={`url(#arrow-${i})`}
                  />
                  <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 4}
                    textAnchor="middle" fontSize="9" fill="#8C8C8C">
                    {e.label}
                  </text>
                </g>
              );
            })}

            {/* 节点 */}
            {nodes.map((node) => {
              const pos = layout.get(node.id);
              if (!pos) return null;
              const isSelected = selectedNode?.id === node.id;
              const isConnected = connectedNodes.has(node.id);
              const opacity = selectedNode ? (isConnected || isSelected ? 1 : 0.3) : 1;
              const color = COLORS[node.group] || '#8C8C8C';

              return (
                <g
                  key={node.id}
                  onClick={() => setSelectedNode(isSelected ? null : node)}
                  className="cursor-pointer"
                  opacity={opacity}
                >
                  <circle cx={pos.x} cy={pos.y} r={isSelected ? 18 : 14}
                    fill={color} stroke="white" strokeWidth={2}
                  />
                  <text x={pos.x} y={pos.y + 28} textAnchor="middle" fontSize="11"
                    fill="#2C2C2C" fontWeight={isSelected ? 600 : 400}>
                    {node.label.length > 4 ? node.label.slice(0, 4) + '..' : node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-4 mt-3 text-xs text-ink-400">
        {Object.entries(COLORS).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function useSimpleLayout(nodes: GraphNode[], edges: { source: string; target: string }[], width: number, height: number) {
  const positions = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const map = new Map<string, { x: number; y: number }>();
    const cols = Math.ceil(Math.sqrt(nodes.length));
    nodes.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      map.set(node.id, {
        x: 80 + (col / cols) * (width - 160),
        y: 60 + (row / Math.ceil(nodes.length / cols)) * (height - 120),
      });
    });
    positions.current = map;
  }, [nodes, edges, width, height]);

  return positions.current;
}
