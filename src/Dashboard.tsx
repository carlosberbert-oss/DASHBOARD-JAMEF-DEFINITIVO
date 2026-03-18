import React, { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Truck, Filter, MapPin, Calendar, Clock, Database, ChartLine, CheckCircle, AlertTriangle, Map as MapIcon, Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import './Dashboard.css';

Chart.register(...registerables, ChartDataLabels);
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b';

const TransportDashboard = () => {
    const [allData, setAllData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [stats, setStats] = useState({ total: 0, onTime: 0, lateTime: 0, pendente: 0, onTimeRate: 0, estadosCount: 0 });
    const [pendingFilters, setPendingFilters] = useState({ ufs: [], weeks: [], statusJamef: [], deliveryStatus: '', search: '' });
    const [appliedFilters, setAppliedFilters] = useState({ ufs: [], weeks: [], statusJamef: [], deliveryStatus: '', search: '' });
    const [loading, setLoading] = useState(true);
    const [geocoding, setGeocoding] = useState(false);
    const [pendingGeocoding, setPendingGeocoding] = useState(0);
    const [viewMode, setViewMode] = useState<'uf' | 'cep'>('uf');
    const [cepCoords, setCepCoords] = useState<{ [key: string]: [number, number] }>(() => {
        try {
            const saved = localStorage.getItem('transport_cep_coords');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    });

    useEffect(() => {
        if (Object.keys(cepCoords).length > 0) {
            localStorage.setItem('transport_cep_coords', JSON.stringify(cepCoords));
        }
    }, [cepCoords]);

    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const charts = useRef<{ [key: string]: Chart }>({});
    const rowsPerPage = 15;

    const apiUrl = 'https://script.google.com/macros/s/AKfycby7AS95N0DGNe_ZRzVOGDkj0CGX00ZtSwLjdeqGTwZpPMxzLFjPmZ9IPKb4kUrzjxWQ/exec';

    useEffect(() => {
        fetchData();
        return () => {
            if (mapInstance.current) mapInstance.current.remove();
            Object.values(charts.current).forEach((chart: any) => {
                if (chart && typeof chart.destroy === 'function') {
                    chart.destroy();
                }
            });
        };
    }, []);

    useEffect(() => {
        if (allData.length > 0) {
            applyFilters();
        }
    }, [allData, appliedFilters]);

    useEffect(() => {
        if (filteredData.length > 0) {
            updateDashboard();
        }
    }, [filteredData, viewMode, cepCoords]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            processData(data);
        } catch (error) {
            console.error('Error fetching data:', error);
            createDemoData();
        } finally {
            setLoading(false);
        }
    };

    const processData = (rawData) => {
        const processed = rawData.map((item, index) => {
            if (index === 0) console.log('Exemplo de item bruto da API:', item);
            const dataPrevisao = item['DATA PREVISAO'] ? new Date(item['DATA PREVISAO']) : null;
            const dataRealizacao = item['DATA REALIZACAO'] ? new Date(item['DATA REALIZACAO']) : null;
            
            let status = item['STATUS'] || 'Pendente';
            if (dataPrevisao && dataRealizacao) {
                status = dataRealizacao.getTime() <= dataPrevisao.getTime() ? 'On time' : 'Late time';
            }

            // Find keys regardless of case or spaces
            const cepKey = Object.keys(item).find(k => k.trim().toUpperCase() === 'CEP') || 'CEP';
            const ufKey = Object.keys(item).find(k => k.trim().toUpperCase() === 'UF ENTREGA' || k.trim().toUpperCase() === 'UF') || 'UF ENTREGA';
            const nfKey = Object.keys(item).find(k => k.trim().toUpperCase() === 'NOTA FISCAL' || k.trim().toUpperCase() === 'NF') || 'NOTA FISCAL';
            const jamefKey = Object.keys(item).find(k => k.trim().toUpperCase() === 'STATUS JAMEF') || 'STATUS JAMEF';
            const semanaKey = Object.keys(item).find(k => k.trim().toUpperCase() === 'SEMANA') || 'SEMANA';

            let rawValue = (item[cepKey] || '').toString().trim();
            // Se vier como número do Excel/Sheets (ex: 12402500.0), remove o .0
            if (rawValue.endsWith('.0')) rawValue = rawValue.slice(0, -2);
            
            let rawCep = rawValue.replace(/\D/g, '');
            
            // Regra: se tem 7 dígitos, adiciona o 0. Se tem 8, mantém.
            if (rawCep.length === 7) {
                rawCep = '0' + rawCep;
            } else if (rawCep.length > 8) {
                // Se por acaso tiver mais de 8 (ex: 124025000), pegamos os 8 primeiros
                rawCep = rawCep.substring(0, 8);
            }

            return {
                id: index,
                ufEntrega: item[ufKey] || '',
                cep: rawCep,
                dataPrevisao: item['DATA PREVISAO'],
                dataRealizacao: item['DATA REALIZACAO'],
                statusJamef: item[jamefKey] || '',
                notaFiscal: item[nfKey]?.toString() || '',
                status,
                semana: Number(item[semanaKey] || 0),
                tempoDias: dataPrevisao && dataRealizacao ? Math.round((dataRealizacao.getTime() - dataPrevisao.getTime()) / (1000 * 60 * 60 * 24)) : null
            };
        });
        setAllData(processed);
    };

    const createDemoData = () => {
        const estados = ['SP', 'RJ', 'MG', 'RS', 'PR', 'SC', 'BA', 'PE', 'CE', 'GO'];
        const ceps = ['01001000', '20010000', '30110000', '90010000', '80010000', '88010000', '40010000', '50010000', '60010000', '74010000'];
        const demo = Array.from({ length: 100 }, (_, i) => ({
            id: i,
            ufEntrega: estados[Math.floor(Math.random() * estados.length)],
            cep: ceps[Math.floor(Math.random() * ceps.length)],
            dataPrevisao: new Date().toISOString(),
            dataRealizacao: new Date().toISOString(),
            statusJamef: 'Entrega Realizada',
            notaFiscal: `NF${10000 + i}`,
            status: Math.random() > 0.2 ? 'On time' : 'Late time',
            semana: Math.floor(Math.random() * 52) + 1,
            tempoDias: Math.floor(Math.random() * 5) - 2
        }));
        setAllData(demo);
    };

    const applyFilters = () => {
        let result = [...allData];
        if (appliedFilters.ufs.length > 0) result = result.filter(d => appliedFilters.ufs.includes(d.ufEntrega));
        if (appliedFilters.weeks.length > 0) result = result.filter(d => appliedFilters.weeks.includes(d.semana));
        if (appliedFilters.statusJamef.length > 0) result = result.filter(d => appliedFilters.statusJamef.includes(d.statusJamef));
        if (appliedFilters.deliveryStatus) result = result.filter(d => d.status === appliedFilters.deliveryStatus);
        if (appliedFilters.search) {
            const s = appliedFilters.search.toLowerCase();
            result = result.filter(d => Object.values(d).some(v => v?.toString().toLowerCase().includes(s)));
        }
        setFilteredData(result);
        setCurrentPage(1);
    };

    const handleApplyClick = () => {
        setAppliedFilters(pendingFilters);
    };

    const handleResetClick = () => {
        const reset = { ufs: [], weeks: [], statusJamef: [], deliveryStatus: '', search: '' };
        setPendingFilters(reset);
        setAppliedFilters(reset);
    };

    const removeFilter = (type: string, value?: any) => {
        setAppliedFilters(prev => {
            const next = { ...prev };
            if (type === 'ufs') next.ufs = prev.ufs.filter(v => v !== value);
            if (type === 'weeks') next.weeks = prev.weeks.filter(v => v !== value);
            if (type === 'statusJamef') next.statusJamef = prev.statusJamef.filter(v => v !== value);
            if (type === 'deliveryStatus') next.deliveryStatus = '';
            if (type === 'search') next.search = '';
            
            // Sync pending filters too
            setPendingFilters(next);
            return next;
        });
    };

    const updateDashboard = () => {
        const total = filteredData.length;
        const onTime = filteredData.filter(d => d.status === 'On time').length;
        const lateTime = filteredData.filter(d => d.status === 'Late time').length;
        const pendente = filteredData.filter(d => d.status === 'Pendente').length;
        const ufs = new Set(filteredData.map(d => d.ufEntrega)).size;

        setStats({
            total,
            onTime,
            lateTime,
            pendente,
            onTimeRate: total > 0 ? Math.round((onTime / total) * 100) : 0,
            estadosCount: ufs
        });

        renderCharts(onTime, lateTime, pendente);
        renderMap();
    };

    const renderCharts = (onTime, lateTime, pendente) => {
        // Status Pie
        const pieCtx = (document.getElementById('statusPieChart') as HTMLCanvasElement)?.getContext('2d');
        if (pieCtx) {
            if (charts.current.pie) charts.current.pie.destroy();
            charts.current.pie = new Chart(pieCtx, {
                type: 'doughnut',
                data: {
                    labels: ['On Time', 'Late Time', 'Pendente'],
                    datasets: [{
                        data: [onTime, lateTime, pendente],
                        backgroundColor: ['#2ecc71', '#e74c3c', '#f39c12'],
                        datalabels: {
                            color: '#fff',
                            font: { weight: 'bold', size: 12 },
                            formatter: (value, ctx) => {
                                const sum = ctx.dataset.data.reduce((a: any, b: any) => a + b, 0);
                                const percentage = Math.round((value / sum) * 100);
                                return value > 0 ? `${percentage}%` : '';
                            }
                        }
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' },
                        datalabels: { display: true }
                    }
                }
            });
        }

        // Total Stacked Bar
        const totalCtx = (document.getElementById('totalStackedBarChart') as HTMLCanvasElement)?.getContext('2d');
        if (totalCtx) {
            if (charts.current.totalBar) charts.current.totalBar.destroy();
            charts.current.totalBar = new Chart(totalCtx, {
                type: 'bar',
                data: {
                    labels: ['Total Geral'],
                    datasets: [
                        {
                            label: 'On Time',
                            data: [onTime],
                            backgroundColor: '#2ecc71',
                            datalabels: {
                                color: '#fff',
                                font: { weight: 'bold', size: 12 },
                                formatter: (value) => value > 0 ? value : ''
                            }
                        },
                        {
                            label: 'Late Time',
                            data: [lateTime],
                            backgroundColor: '#e74c3c',
                            datalabels: {
                                color: '#fff',
                                font: { weight: 'bold', size: 12 },
                                formatter: (value) => value > 0 ? value : ''
                            }
                        },
                        {
                            label: 'Total',
                            data: [onTime + lateTime],
                            type: 'line',
                            showLine: false,
                            pointRadius: 0,
                            datalabels: {
                                color: '#2c3e50',
                                font: { weight: 'bold', size: 14 },
                                anchor: 'end',
                                align: 'top',
                                offset: 5,
                                formatter: (value) => value
                            }
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: { top: 25 }
                    },
                    plugins: {
                        legend: { 
                            position: 'bottom',
                            labels: {
                                filter: (item) => item.text !== 'Total'
                            }
                        },
                        datalabels: { display: true }
                    },
                    scales: {
                        x: { stacked: true, display: true },
                        y: { stacked: true, beginAtZero: true }
                    }
                }
            });
        }

        // Deliveries by UF
        const ufCtx = (document.getElementById('ufBarChart') as HTMLCanvasElement)?.getContext('2d');
        if (ufCtx) {
            const stateStats: { [key: string]: { onTime: number, lateTime: number, total: number } } = {};
            filteredData.forEach((d: any) => { 
                if (d.ufEntrega) {
                    if (!stateStats[d.ufEntrega]) stateStats[d.ufEntrega] = { onTime: 0, lateTime: 0, total: 0 };
                    stateStats[d.ufEntrega].total += 1;
                    if (d.status === 'On time') stateStats[d.ufEntrega].onTime += 1;
                    else if (d.status === 'Late time') stateStats[d.ufEntrega].lateTime += 1;
                }
            });
            const sorted = Object.entries(stateStats).sort((a, b) => b[1].total - a[1].total);
            const maxTotal = Math.max(...sorted.map(s => s[1].total));
            const threshold = maxTotal * 0.07; // 7% of max height

            if (charts.current.ufBar) charts.current.ufBar.destroy();
            charts.current.ufBar = new Chart(ufCtx, {
                type: 'bar',
                data: {
                    labels: sorted.map(s => s[0]),
                    datasets: [
                        { 
                            label: 'On Time', 
                            data: sorted.map(s => s[1].onTime), 
                            backgroundColor: '#2ecc71',
                            borderRadius: 0,
                            datalabels: {
                                color: '#fff',
                                font: { weight: 'bold', size: 10 },
                                anchor: 'center',
                                align: 'center',
                                formatter: (value) => value > 0 ? value : ''
                            }
                        },
                        { 
                            label: 'Late Time', 
                            data: sorted.map(s => s[1].lateTime), 
                            backgroundColor: '#e74c3c',
                            borderRadius: 0,
                            datalabels: {
                                color: '#fff',
                                font: { weight: 'bold', size: 10 },
                                anchor: 'center',
                                align: 'center',
                                formatter: (value) => value > 0 ? value : ''
                            }
                        },
                        {
                            label: 'Total',
                            data: sorted.map(s => s[1].total),
                            type: 'line',
                            hidden: false,
                            showLine: false,
                            pointRadius: 0,
                            datalabels: {
                                color: '#2c3e50',
                                font: { weight: 'bold', size: 11 },
                                anchor: 'end',
                                align: 'top',
                                offset: 2,
                                formatter: (value) => value
                            }
                        }
                    ]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 20 // Space for labels above the bar
                        }
                    },
                    plugins: {
                        legend: { 
                            display: true, 
                            position: 'top',
                            labels: {
                                filter: (item) => item.text !== 'Total'
                            }
                        },
                        datalabels: {
                            display: true,
                            clip: false // Don't clip labels that go outside the bar
                        }
                    },
                    scales: {
                        y: { 
                            stacked: true,
                            beginAtZero: true, 
                            grid: { display: true, color: '#f0f0f0' },
                            ticks: { font: { size: 10 } }
                        },
                        x: { 
                            stacked: true,
                            grid: { display: false },
                            ticks: { font: { size: 10, weight: 'bold' } }
                        }
                    }
                }
            });
        }

        // Deliveries by Region
        const regionCtx = (document.getElementById('regionBarChart') as HTMLCanvasElement)?.getContext('2d');
        if (regionCtx) {
            const regionMapping: { [key: string]: string } = {
                'AC': 'Norte', 'AM': 'Norte', 'AP': 'Norte', 'PA': 'Norte', 'RO': 'Norte', 'RR': 'Norte', 'TO': 'Norte',
                'AL': 'Nordeste', 'BA': 'Nordeste', 'CE': 'Nordeste', 'MA': 'Nordeste', 'PB': 'Nordeste', 'PE': 'Nordeste', 'PI': 'Nordeste', 'RN': 'Nordeste', 'SE': 'Nordeste',
                'DF': 'Centro-Oeste', 'GO': 'Centro-Oeste', 'MT': 'Centro-Oeste', 'MS': 'Centro-Oeste',
                'ES': 'Sudeste', 'MG': 'Sudeste', 'RJ': 'Sudeste', 'SP': 'Sudeste',
                'PR': 'Sul', 'RS': 'Sul', 'SC': 'Sul'
            };

            const regionStats: { [key: string]: { onTime: number, lateTime: number, total: number } } = {
                'Norte': { onTime: 0, lateTime: 0, total: 0 },
                'Nordeste': { onTime: 0, lateTime: 0, total: 0 },
                'Centro-Oeste': { onTime: 0, lateTime: 0, total: 0 },
                'Sudeste': { onTime: 0, lateTime: 0, total: 0 },
                'Sul': { onTime: 0, lateTime: 0, total: 0 }
            };

            filteredData.forEach((d: any) => {
                const region = regionMapping[d.ufEntrega];
                if (region) {
                    regionStats[region].total += 1;
                    if (d.status === 'On time') regionStats[region].onTime += 1;
                    else if (d.status === 'Late time') regionStats[region].lateTime += 1;
                }
            });

            const regionData = Object.entries(regionStats).sort((a, b) => b[1].total - a[1].total);

            if (charts.current.regionBar) charts.current.regionBar.destroy();
            charts.current.regionBar = new Chart(regionCtx, {
                type: 'bar',
                data: {
                    labels: regionData.map(r => r[0]),
                    datasets: [
                        {
                            label: 'On Time',
                            data: regionData.map(r => r[1].onTime),
                            backgroundColor: '#2ecc71',
                            datalabels: {
                                color: '#fff',
                                font: { weight: 'bold', size: 12 },
                                anchor: 'center',
                                align: 'center',
                                formatter: (value) => value > 0 ? value : ''
                            }
                        },
                        {
                            label: 'Late Time',
                            data: regionData.map(r => r[1].lateTime),
                            backgroundColor: '#e74c3c',
                            datalabels: {
                                color: '#fff',
                                font: { weight: 'bold', size: 12 },
                                anchor: 'center',
                                align: 'center',
                                formatter: (value) => value > 0 ? value : ''
                            }
                        },
                        {
                            label: 'Total',
                            data: regionData.map(r => r[1].total),
                            type: 'line',
                            showLine: false,
                            pointRadius: 0,
                            datalabels: {
                                color: '#2c3e50',
                                font: { weight: 'bold', size: 13 },
                                anchor: 'end',
                                align: 'top',
                                offset: 5,
                                formatter: (value) => value
                            }
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 25 } },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: { filter: (item) => item.text !== 'Total' }
                        },
                        datalabels: { display: true, clip: false }
                    },
                    scales: {
                        y: { stacked: true, beginAtZero: true },
                        x: { stacked: true }
                    }
                }
            });
        }

        // Average Lead Time Difference by UF
        const avgLeadTimeCtx = (document.getElementById('avgLeadTimeChart') as HTMLCanvasElement)?.getContext('2d');
        if (avgLeadTimeCtx) {
            const ufDiffs: { [key: string]: { totalDiff: number, count: number } } = {};
            
            filteredData.forEach((d: any) => {
                if (d.ufEntrega && d.tempoDias !== null) {
                    if (!ufDiffs[d.ufEntrega]) ufDiffs[d.ufEntrega] = { totalDiff: 0, count: 0 };
                    ufDiffs[d.ufEntrega].totalDiff += d.tempoDias;
                    ufDiffs[d.ufEntrega].count += 1;
                }
            });

            const avgData = Object.entries(ufDiffs)
                .map(([uf, stats]) => ({
                    uf,
                    avg: Number((stats.totalDiff / stats.count).toFixed(1))
                }))
                .sort((a, b) => b.avg - a.avg);

            if (charts.current.avgLeadTime) charts.current.avgLeadTime.destroy();
            charts.current.avgLeadTime = new Chart(avgLeadTimeCtx, {
                type: 'bar',
                data: {
                    labels: avgData.map(d => d.uf),
                    datasets: [{
                        label: 'Média de Dias (Atraso > 0, Antecipado < 0)',
                        data: avgData.map(d => d.avg),
                        backgroundColor: avgData.map(d => d.avg > 0 ? '#e74c3c' : '#2ecc71'),
                        datalabels: {
                            color: '#2c3e50',
                            font: { weight: 'bold', size: 10 },
                            anchor: (context) => {
                                const value = context.dataset.data[context.dataIndex] as number;
                                return value >= 0 ? 'end' : 'start';
                            },
                            align: (context) => {
                                const value = context.dataset.data[context.dataIndex] as number;
                                return value >= 0 ? 'top' : 'bottom';
                            },
                            formatter: (value) => value > 0 ? `+${value}` : value
                        }
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: true }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Dias' }
                        }
                    }
                }
            });
        }
    };

    const geocodeCEPs = async (data) => {
        const uniqueCEPs = [...new Set(data.map(d => d.cep))].filter(Boolean) as string[];
        const cepsToFetch = uniqueCEPs.filter(cep => !cepCoords[cep]);
        
        if (cepsToFetch.length === 0) return;

        setGeocoding(true);
        setPendingGeocoding(cepsToFetch.length);
        const newCoords = { ...cepCoords };
        
        // Process in even larger batches for maximum speed
        const batchSize = 25;
        for (let i = 0; i < cepsToFetch.length; i += batchSize) {
            const batch = cepsToFetch.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (cep) => {
                try {
                    const cleanCep = cep.replace(/\D/g, '').padStart(8, '0');
                    if (cleanCep.length !== 8) return;

                    let found = false;

                    // Try BrasilAPI first (usually faster and more reliable)
                    try {
                        const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`, {
                            mode: 'cors',
                            headers: { 'Accept': 'application/json' }
                        });
                        if (res.ok) {
                            const json = await res.json();
                            if (json.location?.coordinates) {
                                const lat = parseFloat(json.location.coordinates.latitude);
                                const lng = parseFloat(json.location.coordinates.longitude);
                                if (!isNaN(lat) && !isNaN(lng)) {
                                    newCoords[cep] = [lat, lng];
                                    found = true;
                                }
                            }
                        }
                    } catch (e) { /* Silent fail */ }

                    if (!found) {
                        // Try AwesomeAPI as fallback
                        try {
                            const res = await fetch(`https://cep.awesomeapi.com.br/json/${cleanCep}`, { mode: 'cors' });
                            if (res.ok) {
                                const json = await res.json();
                                const lat = parseFloat(json.lat);
                                const lng = parseFloat(json.lng);
                                if (!isNaN(lat) && !isNaN(lng)) {
                                    newCoords[cep] = [lat, lng];
                                    found = true;
                                }
                            }
                        } catch (e) { /* Silent fail */ }
                    }
                } catch (e) {
                    console.error(`Error geocoding CEP ${cep}:`, e);
                }
            }));

            // Update state after each batch to show progress
            setCepCoords({ ...newCoords });
            setPendingGeocoding(Math.max(0, cepsToFetch.length - (i + batchSize)));
            
            // Minimal delay to respect rate limits but stay fast
            if (i + batchSize < cepsToFetch.length) {
                await new Promise(resolve => setTimeout(resolve, 30));
            }
        }
        setGeocoding(false);
        setPendingGeocoding(0);
    };

    useEffect(() => {
        if (filteredData.length > 0 && viewMode === 'cep') {
            geocodeCEPs(filteredData);
        }
    }, [filteredData, viewMode]);

    const renderMap = () => {
        if (!mapRef.current) return;
        if (!mapInstance.current) {
            mapInstance.current = L.map(mapRef.current).setView([-15, -55], 4);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance.current);
        }

        // Remove existing markers
        mapInstance.current.eachLayer(layer => { 
            if (layer instanceof L.Marker || layer instanceof L.CircleMarker) mapInstance.current!.removeLayer(layer); 
        });

        if (viewMode === 'uf') {
            const stateCoords: { [key: string]: [number, number] } = {
                'AC': [-8.77, -70.55], 'AL': [-9.71, -35.73], 'AM': [-3.47, -65.10], 'AP': [1.41, -51.77],
                'BA': [-12.96, -41.70], 'CE': [-5.20, -39.53], 'DF': [-15.83, -47.86], 'ES': [-19.19, -40.34],
                'GO': [-15.98, -49.86], 'MA': [-5.42, -45.44], 'MG': [-18.10, -44.38], 'MS': [-20.51, -54.54],
                'MT': [-12.64, -55.42], 'PA': [-3.79, -52.48], 'PB': [-7.28, -36.72], 'PE': [-8.38, -37.86],
                'PI': [-6.60, -42.28], 'PR': [-24.89, -51.55], 'RJ': [-22.25, -42.66], 'RN': [-5.81, -36.59],
                'RO': [-10.83, -63.34], 'RR': [1.99, -61.33], 'RS': [-30.17, -53.50], 'SC': [-27.45, -50.95],
                'SE': [-10.57, -37.45], 'SP': [-22.19, -48.79], 'TO': [-9.46, -48.26]
            };

            const counts: { [key: string]: number } = {};
            filteredData.forEach((d: any) => { if (d.ufEntrega) counts[d.ufEntrega] = (counts[d.ufEntrega] || 0) + 1; });

            const bounds = L.latLngBounds([]);
            let hasMarkers = false;

            Object.entries(stateCoords).forEach(([uf, coords]) => {
                const count = counts[uf] || 0;
                if (count > 0) {
                    hasMarkers = true;
                    bounds.extend(coords as L.LatLngExpression);
                    let color = '#3498db';
                    if (count > 5) color = '#2ecc71';
                    if (count > 15) color = '#f39c12';
                    if (count > 30) color = '#e74c3c';
                    
                    const size = Math.min(30 + (count * 2), 60);

                    const icon = L.divIcon({
                        className: 'custom-map-marker',
                        html: `
                            <div style="
                                width: ${size}px;
                                height: ${size}px;
                                background: ${color};
                                border-radius: 50%;
                                border: 2px solid white;
                                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: white;
                                font-weight: bold;
                                font-size: ${Math.max(10, Math.min(14, size/3))}px;
                            ">
                                ${count}
                            </div>
                        `,
                        iconSize: [size, size],
                        iconAnchor: [size/2, size/2]
                    });

                    L.marker(coords as L.LatLngExpression, { icon })
                        .addTo(mapInstance.current!)
                        .bindTooltip(`<strong>${uf}</strong>: ${count} entregas`);
                }
            });

            if (hasMarkers && mapInstance.current) {
                mapInstance.current.fitBounds(bounds, { padding: [50, 50] });
            }
        } else {
            // CEP View - Pins
            const bounds = L.latLngBounds([]);
            let hasMarkers = false;

            filteredData.forEach((d: any) => {
                if (d.cep && cepCoords[d.cep]) {
                    const coords = cepCoords[d.cep];
                    if (isNaN(coords[0]) || isNaN(coords[1])) return;
                    
                    hasMarkers = true;
                    bounds.extend(coords as L.LatLngExpression);

                    let color = '#3498db';
                    if (d.status === 'On time') color = '#2ecc71';
                    if (d.status === 'Late time') color = '#e74c3c';
                    if (d.status === 'Pendente') color = '#f39c12';

                    const pinIcon = L.divIcon({
                        className: 'custom-pin',
                        html: `
                            <div style="
                                position: relative;
                                width: 24px;
                                height: 24px;
                            ">
                                <div style="
                                    width: 24px;
                                    height: 24px;
                                    background: ${color};
                                    border-radius: 50% 50% 50% 0;
                                    transform: rotate(-45deg);
                                    border: 2px solid white;
                                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                ">
                                    <div style="
                                        width: 8px;
                                        height: 8px;
                                        background: white;
                                        border-radius: 50%;
                                        transform: rotate(45deg);
                                    "></div>
                                </div>
                            </div>
                        `,
                        iconSize: [24, 24],
                        iconAnchor: [12, 24],
                        popupAnchor: [0, -24]
                    });

                    L.marker(coords as L.LatLngExpression, { icon: pinIcon })
                    .addTo(mapInstance.current!)
                    .bindPopup(`
                        <div style="font-family: sans-serif; padding: 5px;">
                            <strong style="color: #2c3e50; font-size: 14px;">NF: ${d.notaFiscal}</strong><br/>
                            <div style="margin-top: 5px; color: #7f8c8d; font-size: 12px;">
                                <strong>CEP:</strong> ${d.cep}<br/>
                                <strong>Status:</strong> <span style="color: ${color}; font-weight: bold;">${d.status}</span><br/>
                                <strong>UF:</strong> ${d.ufEntrega}
                            </div>
                        </div>
                    `);
                }
            });

            if (hasMarkers && mapInstance.current) {
                mapInstance.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
            }
        }
    };

    const paginatedData = filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);

    return (
        <div className="dashboard-container">
            <div className="sidebar">
                <div className="logo">
                    <Truck size={32} />
                    <h2>Transport Luuna</h2>
                </div>
                <div className="filters">
                    <h3><Filter size={18} /> Filtros</h3>
                    <div className="filter-group">
                        <label><MapPin size={14} /> UF de Entrega</label>
                        <select multiple value={pendingFilters.ufs} onChange={(e) => setPendingFilters(prev => ({ ...prev, ufs: Array.from(e.target.selectedOptions).map(o => (o as HTMLOptionElement).value) }))}>
                            {[...new Set(allData.map((d: any) => d.ufEntrega))].filter(Boolean).sort().map(uf => <option key={uf as string} value={uf as string}>{uf as string}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label><Calendar size={14} /> Semana</label>
                        <select multiple value={pendingFilters.weeks.map(String)} onChange={(e) => setPendingFilters(prev => ({ ...prev, weeks: Array.from(e.target.selectedOptions).map(o => Number((o as HTMLOptionElement).value)) }))}>
                            {[...new Set(allData.map((d: any) => d.semana))].sort((a: any, b: any) => a - b).map(w => <option key={w as number} value={w as number}>Semana {w as number}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label><Truck size={14} /> Status JAMEF</label>
                        <select multiple value={pendingFilters.statusJamef} onChange={(e) => setPendingFilters(prev => ({ ...prev, statusJamef: Array.from(e.target.selectedOptions).map(o => (o as HTMLOptionElement).value) }))}>
                            {[...new Set(allData.map((d: any) => d.statusJamef))].filter(Boolean).sort().map(s => <option key={s as string} value={s as string}>{s as string}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label><Clock size={14} /> Status Entrega</label>
                        <select value={pendingFilters.deliveryStatus} onChange={(e) => setPendingFilters(prev => ({ ...prev, deliveryStatus: e.target.value }))}>
                            <option value="">Todos</option>
                            <option value="On time">On time</option>
                            <option value="Late time">Late time</option>
                        </select>
                    </div>
                    <div className="filter-buttons">
                        <button className="btn-primary" onClick={handleApplyClick}>Aplicar</button>
                        <button className="btn-secondary" onClick={handleResetClick}>Limpar</button>
                    </div>
                </div>
                <div className="data-info">
                    <p><span>API:</span> <span>Google Sheets</span></p>
                    <p><span>Total:</span> <span>{allData.length}</span></p>
                </div>
            </div>

            <div className="main-content">
                <header className="header">
                    <div className="header-title">
                        <h1><ChartLine /> Performance de Entregas</h1>
                        <div className="active-filters-bar">
                            {appliedFilters.ufs.map(uf => (
                                <span key={uf} className="filter-badge">
                                    UF: {uf} <button onClick={() => removeFilter('ufs', uf)}>×</button>
                                </span>
                            ))}
                            {appliedFilters.weeks.map(w => (
                                <span key={w} className="filter-badge">
                                    Semana: {w} <button onClick={() => removeFilter('weeks', w)}>×</button>
                                </span>
                            ))}
                            {appliedFilters.statusJamef.map(s => (
                                <span key={s} className="filter-badge">
                                    JAMEF: {s} <button onClick={() => removeFilter('statusJamef', s)}>×</button>
                                </span>
                            ))}
                            {appliedFilters.deliveryStatus && (
                                <span className="filter-badge">
                                    Entrega: {appliedFilters.deliveryStatus} <button onClick={() => removeFilter('deliveryStatus')}>×</button>
                                </span>
                            )}
                            {appliedFilters.search && (
                                <span className="filter-badge">
                                    Busca: {appliedFilters.search} <button onClick={() => removeFilter('search')}>×</button>
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="header-controls">
                        {geocoding && (
                            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 animate-pulse">
                                <RefreshCw className="animate-spin" size={14} />
                                <span>Geocodificando {pendingGeocoding} CEPs...</span>
                            </div>
                        )}
                        <button className="btn-refresh" onClick={fetchData}><RefreshCw size={16} /> Atualizar</button>
                        <button className="btn-refresh" style={{ background: '#94a3b8' }} onClick={() => {
                            if (window.confirm('Deseja realmente limpar o cache de coordenadas? Todos os CEPs precisarão ser geocodificados novamente.')) {
                                localStorage.removeItem('transport_cep_coords');
                                setCepCoords({});
                                fetchData();
                            }
                        }}>Limpar Cache ({Object.keys(cepCoords).length})</button>
                    </div>
                </header>

                <section className="kpi-section">
                    <div className="kpi-grid">
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: 'var(--primary)' }}><Truck /></div>
                            <div className="kpi-info">
                                <h4>Total</h4>
                                <p>{stats.total}</p>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: 'var(--success)' }}><CheckCircle /></div>
                            <div className="kpi-info">
                                <h4>On Time</h4>
                                <p>{stats.onTimeRate}%</p>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: 'var(--danger)' }}><AlertTriangle /></div>
                            <div className="kpi-info">
                                <h4>Atrasos</h4>
                                <p>{stats.lateTime}</p>
                            </div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-icon" style={{ background: 'var(--warning)' }}><MapIcon /></div>
                            <div className="kpi-info">
                                <h4>Estados</h4>
                                <p>{stats.estadosCount}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="charts-section">
                    <div className="chart-row">
                        <div className="chart-card large">
                            <div className="chart-header">
                                <h3><MapIcon size={18} /> Mapa de Entregas {geocoding && <span className="text-xs font-normal text-blue-500 ml-2 inline-flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> {pendingGeocoding} CEPs restantes...</span>}</h3>
                                <div className="map-controls">
                                    <div className="view-toggle">
                                        <button 
                                            className={viewMode === 'uf' ? 'active' : ''} 
                                            onClick={() => setViewMode('uf')}
                                        >
                                            UF
                                        </button>
                                        <button 
                                            className={viewMode === 'cep' ? 'active' : ''} 
                                            onClick={() => setViewMode('cep')}
                                        >
                                            CEP
                                        </button>
                                    </div>

                                </div>
                            </div>
                            <div id="brazilMap" ref={mapRef}></div>
                        </div>
                        <div className="chart-card">
                            <div className="chart-header"><h3>Status</h3></div>
                            <div className="chart-container"><canvas id="statusPieChart"></canvas></div>
                        </div>
                        <div className="chart-card">
                            <div className="chart-header"><h3>Total On Time vs Late Time</h3></div>
                            <div className="chart-container"><canvas id="totalStackedBarChart"></canvas></div>
                        </div>
                    </div>
                    <div className="chart-row">
                        <div className="chart-card full-width">
                            <div className="chart-header"><h3><Truck size={18} /> Entregas por UF</h3></div>
                            <div className="chart-container"><canvas id="ufBarChart"></canvas></div>
                        </div>
                    </div>

                    <div className="chart-row">
                        <div className="chart-card full-width">
                            <div className="chart-header"><h3><Truck size={18} /> Entregas por Região</h3></div>
                            <div className="chart-container"><canvas id="regionBarChart"></canvas></div>
                        </div>
                    </div>

                    <div className="chart-row">
                        <div className="chart-card full-width">
                            <div className="chart-header"><h3><Clock size={18} /> Média de Dias de Diferença (Realizado vs Previsto) por UF</h3></div>
                            <div className="chart-container"><canvas id="avgLeadTimeChart"></canvas></div>
                        </div>
                    </div>

                    <div className="chart-card full-width">
                        <div className="chart-header">
                            <h3><Database size={18} /> Detalhes</h3>
                            <div className="search-box">
                                <Search size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar..." 
                                    value={pendingFilters.search}
                                    onChange={(e) => setPendingFilters(prev => ({ ...prev, search: e.target.value }))} 
                                    onKeyDown={(e) => e.key === 'Enter' && handleApplyClick()}
                                />
                            </div>
                        </div>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>UF</th>
                                        <th>Previsão</th>
                                        <th>Realização</th>
                                        <th>Status JAMEF</th>
                                        <th>NF</th>
                                        <th>Status</th>
                                        <th>Semana</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedData.map(item => (
                                        <tr key={item.id}>
                                            <td><span className="state-badge">{item.ufEntrega}</span></td>
                                            <td>{item.dataPrevisao ? new Date(item.dataPrevisao).toLocaleDateString() : '-'}</td>
                                            <td>{item.dataRealizacao ? new Date(item.dataRealizacao).toLocaleDateString() : '-'}</td>
                                            <td>{item.statusJamef}</td>
                                            <td>{item.notaFiscal}</td>
                                            <td><span className={`status-badge status-${item.status.toLowerCase().replace(' ', '')}`}>{item.status}</span></td>
                                            <td>{item.semana}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="pagination">
                            <div className="pagination-info">
                                Página {currentPage} de {totalPages}
                            </div>
                            <div className="pagination-controls">
                                <button className="btn-icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={18} /></button>
                                <button className="btn-icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight size={18} /></button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default TransportDashboard;
