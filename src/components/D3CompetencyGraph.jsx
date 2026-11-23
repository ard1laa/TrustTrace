import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { ZoomIn, ZoomOut, RotateCcw, Layers, EyeOff, Sliders } from 'lucide-react';
import { resolveField, axisForCredential, axisColor } from '../../shared/skillTaxonomy.js';

// Nodes: holder → skill axes of their field → individual credentials.
export default function D3CompetencyGraph({
  student,
  credentials = [],
  field,
  selectedCredId,
  onSelectCredential,
  respectPrivacy = true,
  isDark = false,
  height = 420
}) {
  const fieldDef = resolveField(field || student?.fieldOfStudy || student?.program);
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const zoomBehaviorRef = useRef(null);

  const [activeDomainFilter, setActiveDomainFilter] = useState('ALL');
  const [collapseSubClusters, setCollapseSubClusters] = useState(false);
  const [showMathHud, setShowMathHud] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 720, height });
  const [csConstant, setCsConstant] = useState(0.52);

  const visibleCredentials = useMemo(() => {
    return credentials
      .filter((c) => !(respectPrivacy && c.isPublic === false) && c.state !== 'Draft')
      .map((c) => ({ ...c, axis: axisForCredential(c, fieldDef.id) }))
      .filter((c) => activeDomainFilter === 'ALL' || c.axis === activeDomainFilter);
  }, [credentials, respectPrivacy, activeDomainFilter, fieldDef.id]);

  useEffect(() => setActiveDomainFilter('ALL'), [fieldDef.id]);

  const hiddenPrivateCount = useMemo(() => {
    if (!respectPrivacy) return 0;
    return credentials.filter((c) => c.isPublic === false && c.state !== 'Draft').length;
  }, [credentials, respectPrivacy]);

  const { nodes, links, ksValue } = useMemo(() => {
    const nodeList = [];
    const linkList = [];

    const rootId = `soul-${student?.id || 'student'}`;
    nodeList.push({
      id: rootId,
      label: student?.name?.split(' ').slice(0, 2).join(' ') || 'Holder',
      group: 'root',
      radius: 25,
      color: '#0A66C2'
    });

    const domainsPresent = fieldDef.axes.map((a) => a.name).filter((axis) => visibleCredentials.some((c) => c.axis === axis));

    domainsPresent.forEach((domain) => {
      const domainCreds = visibleCredentials.filter((c) => c.axis === domain);
      const avgScore = Math.round(
        domainCreds.reduce((acc, c) => acc + (Number(c.masteryScore) || 85), 0) /
          Math.max(1, domainCreds.length)
      );
      const domainNodeId = `domain-${domain}`;
      nodeList.push({
        id: domainNodeId,
        label: domain,
        group: 'domain',
        domain,
        count: domainCreds.length,
        avgScore,
        radius: collapseSubClusters ? 24 : 20,
        color: axisColor(fieldDef.id, domain)
      });

      linkList.push({
        source: rootId,
        target: domainNodeId,
        type: 'root-domain',
        distanceFactor: 1.0
      });

      if (!collapseSubClusters) {
        domainCreds.forEach((cred) => {
          const isRevoked = cred.state === 'Revoked';
          nodeList.push({
            id: cred.id,
            label:
              cred.achievementTitle.length > 22
                ? cred.achievementTitle.slice(0, 20) + '…'
                : cred.achievementTitle,
            group: 'credential',
            domain,
            credential: cred,
            isRevoked,
            radius: 15,
            color: isRevoked ? '#DC2626' : axisColor(fieldDef.id, domain)
          });

          linkList.push({
            source: domainNodeId,
            target: cred.id,
            type: 'domain-cred',
            distanceFactor: 0.75
          });
        });
      }
    });

    const N = Math.max(1, nodeList.length);
    const ks = csConstant * Math.sqrt((canvasSize.width * canvasSize.height) / N);

    return {
      nodes: nodeList,
      links: linkList,
      ksValue: Number(ks.toFixed(1))
    };
  }, [student, visibleCredentials, collapseSubClusters, canvasSize, csConstant, fieldDef]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(280, Math.floor(entry.contentRect.width));
        setCanvasSize({ width: w, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [height]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = canvasSize.width;
    const h = canvasSize.height;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const gMain = svg.append('g').attr('class', 'graph-viewport');

    const zoom = d3
      .zoom()
      .scaleExtent([0.45, 2.5])
      .on('zoom', (event) => {
        gMain.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance((d) => ksValue * (d.distanceFactor || 0.85))
          .strength(0.7)
      )
      .force('charge', d3.forceManyBody().strength((d) => (d.group === 'root' ? -ksValue * 3.5 : -ksValue * 2.2)))
      .force('center', d3.forceCenter(width / 2, h / 2))
      .force('collide', d3.forceCollide().radius((d) => d.radius + 24).iterations(2));

    const linkSelection = gMain
      .append('g')
      .attr('stroke-linecap', 'round')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => (isDark ? (d.type === 'root-domain' ? '#6E7681' : '#30363D') : d.type === 'root-domain' ? '#94A3B8' : '#CBD5E1'))
      .attr('stroke-opacity', 0.75)
      .attr('stroke-width', (d) => (d.type === 'root-domain' ? 2 : 1.5));

    const nodeSelection = gMain
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (_event, d) => {
        if (d.group === 'credential' && d.credential && onSelectCredential) {
          onSelectCredential(d.credential);
        }
      });

    nodeSelection
      .append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => (d.group === 'credential' ? (isDark ? '#0D1117' : '#FFFFFF') : d.color))
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', (d) => (d.id === selectedCredId ? 3.5 : 2.5));

    nodeSelection
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .attr('fill', (d) => (d.group === 'credential' ? d.color : '#FFFFFF'))
      .text((d) => {
        if (d.group === 'root') return 'DID';
        if (d.group === 'domain') return `${d.avgScore}%`;
        if (d.isRevoked) return 'REV';
        return `${d.credential?.masteryScore || 90}`;
      });

    const labelGroup = nodeSelection.append('g').attr('transform', (d) => `translate(0, ${d.radius + 13})`);

    labelGroup
      .append('rect')
      .attr('x', (d) => -Math.max(40, d.label.length * 3.1))
      .attr('y', -8)
      .attr('width', (d) => Math.max(80, d.label.length * 6.2))
      .attr('height', 16)
      .attr('rx', 4)
      .attr('fill', isDark ? '#1B1F23' : '#FFFFFF')
      .attr('fill-opacity', 0.94)
      .attr('stroke', isDark ? '#30363D' : '#E0DFDC')
      .attr('stroke-width', 0.8);

    labelGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.25em')
      .attr('font-size', '9.5px')
      .attr('font-weight', '600')
      .attr('fill', isDark ? '#E6EDF3' : '#191919')
      .text((d) => d.label);

    simulation.on('tick', () => {
      nodes.forEach((d) => {
        const pad = 36;
        d.x = Math.max(pad, Math.min(width - pad, d.x));
        d.y = Math.max(pad, Math.min(h - pad, d.y));
      });

      linkSelection
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

      nodeSelection.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [nodes, links, ksValue, canvasSize, selectedCredId, onSelectCredential, isDark]);

  const handleZoom = (factor) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(250)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  const allDomains = ['ALL', ...fieldDef.axes.map((a) => a.name)];

  return (
    <div className="flex flex-col">
      {/* Compact Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E0DFDC] dark:border-[#30363D]">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1 max-w-full">
          {allDomains.map((dom) => {
            const active = activeDomainFilter === dom;
            return (
              <button
                key={dom}
                onClick={() => setActiveDomainFilter(dom)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  active
                    ? 'bg-[#0A66C2] text-white'
                    : 'bg-[#F4F2EE] dark:bg-[#0D1117] text-[#404040] dark:text-[#8B949E]'
                }`}
              >
                {dom === 'ALL' ? 'All' : dom}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCollapseSubClusters((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-[#E0DFDC] dark:border-[#30363D] text-[#666666] dark:text-[#8B949E]"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{collapseSubClusters ? 'Expand' : 'Group'}</span>
          </button>

          <button
            onClick={() => setShowMathHud((prev) => !prev)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${
              showMathHud
                ? 'border-[#0A66C2] text-[#0A66C2] dark:text-[#58A6FF]'
                : 'border-[#E0DFDC] dark:border-[#30363D] text-[#666666] dark:text-[#8B949E]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Physics Math</span>
          </button>

          <div className="flex items-center border border-[#E0DFDC] dark:border-[#30363D] rounded-lg overflow-hidden bg-[#F4F2EE] dark:bg-[#0D1117]">
            <button onClick={() => handleZoom(1.25)} className="p-1.5">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleZoom(0.8)} className="p-1.5">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleResetZoom} className="p-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Graph Canvas */}
      <div
        ref={containerRef}
        className="relative w-full rounded-lg mt-2.5 bg-[#FAF9F7] dark:bg-[#0D1117] border border-[#E0DFDC] dark:border-[#30363D] overflow-hidden"
        style={{ height: `${height}px` }}
      >
        <svg
          ref={svgRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="w-full h-full block select-none"
        />

        {/* Collapsible Fruchterman-Reingold Math Overlay */}
        {showMathHud && (
          <div className="absolute top-2.5 left-2.5 bg-white/95 dark:bg-[#1B1F23]/95 border border-[#E0DFDC] dark:border-[#30363D] rounded-lg p-2.5 text-[11px] shadow-sm">
            <div className="font-semibold text-[#191919] dark:text-white">
              Fruchterman-Reingold (N={nodes.length})
            </div>
            <div className="mt-1 font-mono text-[10px] text-[#666666] dark:text-[#8B949E] space-y-0.5">
              <div>k_s = C_s·√(W·H/N) = {ksValue}px</div>
              <div>f_a(d) = d² / {ksValue}</div>
              <div>f_r(d) = -({ksValue})² / d</div>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[10px]">C_s:</span>
              <input
                type="range"
                min="0.35"
                max="0.75"
                step="0.05"
                value={csConstant}
                onChange={(e) => setCsConstant(parseFloat(e.target.value))}
                className="w-20 accent-[#0A66C2] h-1"
              />
            </div>
          </div>
        )}

        {hiddenPrivateCount > 0 && (
          <div className="absolute top-2.5 right-2.5 bg-white/95 dark:bg-[#1B1F23]/95 border border-[#E0DFDC] dark:border-[#30363D] rounded-lg px-2.5 py-1 text-[11px] flex items-center gap-1.5">
            <EyeOff className="w-3.5 h-3.5 text-[#0A66C2]" />
            <span>{hiddenPrivateCount} Private</span>
          </div>
        )}
      </div>
    </div>
  );
}
