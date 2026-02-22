import React, { useState, useEffect, useRef } from 'react';
import questTimeline from './quest_timeline.json';
import runewordData from './runewords.json';
import cubingData from './cubing.json';
import warlockGuide from './warlock_guide.json';

// --- Types ---
interface Task {
    text: string;
    is_checked: boolean;
}

interface Step {
    index: number;
    condition: { type: string; value: any };
    location: string;
    tasks: Task[];
    note: string;
    strategic_tip?: string;
}

interface Runeword {
    name: string;
    original_name: string;
    runes: string[];
    item_types: string[];
    level: number;
    stats: string[];
    category: string;
    material_sources: string;
}

interface CubingRecipe {
    name: string;
    category: string;
    recipe: string;
    result: string;
    description?: string;
    runes?: string[];
}

interface Guide {
    meta: {
        id: string;
        title: string;
        author_id: string;
        original_source_id: string | null;
        version: string;
        last_updated: string;
        class: string;
        is_public?: boolean;
        difficulty_notes?: {
            nightmare: string[];
            hell: string[];
        };
        reference_video?: string;
        source_type?: 'library' | 'local' | 'file';
        file_path?: string;
    };
    steps: Step[];
}

interface DisplayInfo {
    id: number;
    bounds: { x: number; y: number; width: number; height: number };
    workArea: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
    isPrimary: boolean;
    relativeX: number;
    relativeY: number;
}

const DEFAULT_GUIDE: Guide = { ...questTimeline, meta: { ...questTimeline.meta, source_type: 'library' } } as Guide;
const ABYSS_WARLOCK: Guide = { ...warlockGuide, meta: { ...warlockGuide.meta, source_type: 'library' } } as Guide;
const ALL_GUIDES = [DEFAULT_GUIDE, ABYSS_WARLOCK];
const APP_VERSION = '1.1.0';

const RUNE_MAP: Record<string, string> = {
    "엘": "El", "엘드": "Eld", "티르": "Tir", "네프": "Nef", "에드": "Eth",
    "아이드": "Ith", "탈": "Tal", "랄": "Ral", "오르트": "Ort", "주울": "Thul",
    "앰": "Amn", "솔": "Sol", "샤엘": "Shael", "돌": "Dol", "헬": "Hel",
    "이오": "Io", "룸": "Lum", "코": "Ko", "팔": "Fal", "렘": "Lem",
    "풀": "Pul", "우움": "Um", "움": "Um", "말": "Mal", "이스트": "Ist",
    "굴": "Gul", "벡스": "Vex", "오움": "Ohm", "로": "Lo", "수르": "Sur",
    "베르": "Ber", "자": "Jah", "참": "Cham", "조드": "Zod"
};

const getRuneImageUrl = (runeName: string) => {
    const engName = RUNE_MAP[runeName];
    if (!engName) return null;
    return `./data/portal-master/images/items/socketables/rune/${engName}_Rune.png`;
};

const getItemImageUrl = (itemName: string) => {
    if (RUNE_MAP[itemName]) return getRuneImageUrl(itemName);

    // Gems mapping
    const gems: Record<string, string> = {
        "최상급 자수정": "Perfect_Amethyst", "상급 자수정": "Flawless_Amethyst", "자수정": "Amethyst",
        "최상급 루비": "Perfect_Ruby", "상급 루비": "Flawless_Ruby", "루비": "Ruby",
        "최상급 사파이어": "Perfect_Sapphire", "상급 사파이어": "Flawless_Sapphire", "사파이어": "Sapphire",
        "최상급 토파즈": "Perfect_Topaz", "상급 토파즈": "Flawless_Topaz", "토파즈": "Topaz",
        "최상급 에메랄드": "Perfect_Emerald", "상급 에메랄드": "Flawless_Emerald", "에메랄드": "Emerald",
        "최상급 다이아몬드": "Perfect_Diamond", "상급 다이아몬드": "Flawless_Diamond", "다이아몬드": "Diamond",
        "최상급 해골": "Perfect_Skull", "상급 해골": "Flawless_Skull", "해골": "Skull"
    };
    if (gems[itemName]) return `./data/portal-master/images/items/socketables/gem/${gems[itemName]}.png`;

    // Misc items
    if (itemName.includes("아뮬렛")) return `./data/portal-master/images/items/amulet/Amulet_1.png`;
    if (itemName.includes("링") || itemName.includes("반지")) return `./data/portal-master/images/items/ring/Ring_1.png`;
    if (itemName.includes("부적")) return `./data/portal-master/images/items/charms/charm1u.png`;

    return null;
};

function App() {
    // State
    const [guide, setGuide] = useState<Guide>(() => {
        // 마지막 세션 복원: 파일 기반이면 path로, 로컬이면 id로 복원
        const lastSession = localStorage.getItem('d2r-last-session');
        if (lastSession) {
            try {
                const session = JSON.parse(lastSession);
                // 파일 기반 가이드는 나중에 비동기로 로드되므로, 일단 기본 가이드를 반환
                // (useEffect에서 파일 복원 처리)
                if (session.source_type === 'local' && session.id) {
                    const custom = localStorage.getItem(`d2r-guide-${session.id}`);
                    if (custom) return JSON.parse(custom);
                }
                if (session.source_type === 'library' && session.id) {
                    const library = ALL_GUIDES.find(g => g.meta.id === session.id);
                    if (library) return library;
                }
            } catch (e) { /* fallback */ }
        }
        // 레거시 호환
        const lastGuideId = localStorage.getItem('d2r-last-guide-id');
        if (lastGuideId) {
            const custom = localStorage.getItem(`d2r-guide-${lastGuideId}`);
            if (custom) {
                const parsed = JSON.parse(custom);
                // 라이브러리와 ID 충돌 방지: source_type이 library가 아닌 경우만
                if (parsed.meta?.source_type !== 'library') return parsed;
            }
            const library = ALL_GUIDES.find(g => g.meta.id === lastGuideId);
            if (library) return library;
        }
        return DEFAULT_GUIDE;
    });

    // Guide Management State
    // 라이브러리 ID 목록 (필터링용)
    const LIBRARY_IDS = new Set(ALL_GUIDES.map(g => g.meta.id));

    const [savedGuides, setSavedGuides] = useState<{ id: string; title: string; path?: string; source_type?: string }[]>(() => {
        const index = localStorage.getItem('d2r-guides-index');
        if (!index) return [];
        try {
            const parsed = JSON.parse(index);
            // 라이브러리 가이드가 인덱스에 섞여 있으면 필터링
            return parsed.filter((g: any) => {
                if (g.source_type === 'library') return false;
                if (LIBRARY_IDS.has(g.id) && !g.path) return false; // path 없는 라이브러리 ID는 제거
                return true;
            });
        } catch (e) { return []; }
    });

    // --- Auto-Hide State ---
    const [autoHide, setAutoHide] = useState<{ enabled: boolean; x: number; y: number; targetColor: string; interval: number }>(() => {
        const saved = localStorage.getItem('d2r-autohide');
        const parsed = saved ? JSON.parse(saved) : { enabled: false, x: 0, y: 0, targetColor: '#000000', interval: 500 };
        return { ...parsed, enabled: false }; // APP 실행 시 초기 상태는 무조건 비활성화
    });
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);

    // View Mode State
    const [viewMode, setViewMode] = useState<'guide' | 'hud' | 'runeword'>('hud'); // Default to HUD for web users
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

    const EMPTY_GUIDE = (title: string): Guide => ({
        meta: {
            id: 'local-' + Date.now(),
            title: title || '새로운 가이드',
            author_id: 'user',
            original_source_id: null,
            version: '1.0',
            last_updated: new Date().toISOString().split('T')[0],
            class: 'Custom',
            source_type: 'local'
        },
        steps: [
            {
                index: 0,
                condition: { type: 'level', value: 1 },
                location: '새로운 지역',
                tasks: [{ text: '첫 번째 할 일을 입력하세요', is_checked: false }],
                note: '상세 내용을 입력하세요',
                strategic_tip: ''
            }
        ]
    });

    // Popup Positions (초기 진입 시 주모니터 중앙 배치를 위해 localStorage 값을 무시하고 handlePrimaryDisplay에서 결정)
    const [hudPos, setHudPos] = useState<{ x: number; y: number }>({ x: 32, y: 32 });
    const hasCenteredRef = useRef(false); // 중앙 배치 완료 여부 플래그
    const [editorPos, setEditorPos] = useState<{ x: number; y: number }>(() => JSON.parse(localStorage.getItem('guide-pos') || '{"x": 32, "y": 32}'));
    const [runewordPos, setRunewordPos] = useState<{ x: number; y: number }>(() => JSON.parse(localStorage.getItem('runepos') || '{"x": 32, "y": 32}'));
    const [settingsPos, setSettingsPos] = useState<{ x: number; y: number }>(() => JSON.parse(localStorage.getItem('settings-pos') || '{"x": 350, "y": 32}'));
    const [uiScale, setUiScale] = useState<number>(() => parseFloat(localStorage.getItem('uiscale') || '1.0'));
    const [hudSize, setHudSize] = useState<{ width: number; height: number }>(() => {
        try {
            return JSON.parse(localStorage.getItem('hud-size') || '{"width": 300, "height": 450}');
        } catch (e) {
            return { width: 300, height: 450 };
        }
    });

    const [editorSize, setEditorSize] = useState<{ width: number; height: number }>(() => {
        try {
            return JSON.parse(localStorage.getItem('editor-size') || '{"width": 480, "height": 600}');
        } catch (e) {
            return { width: 480, height: 600 };
        }
    });

    const [runewordSize, setRunewordSize] = useState<{ width: number; height: number }>(() => {
        try {
            return JSON.parse(localStorage.getItem('runeword-size') || '{"width": 380, "height": 700}');
        } catch (e) {
            return { width: 380, height: 700 };
        }
    });

    const [settingsSize, setSettingsSize] = useState<{ width: number; height: number }>(() => {
        try {
            return JSON.parse(localStorage.getItem('settings-size') || '{"width": 280, "height": 500}');
        } catch (e) {
            return { width: 280, height: 500 };
        }
    });

    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [toggleHotkey, setToggleHotkey] = useState(() => localStorage.getItem('toggle-hotkey') || 'Control+Q');

    // Update State
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'error'>('idle');
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);

    const [toast, setToast] = useState<{ message: string; show: boolean }>({ message: '', show: false });
    const showToast = (message: string) => {
        setToast({ message, show: true });
        setTimeout(() => setToast({ message: '', show: false }), 3000);
    };

    const [searchRune, setSearchRune] = useState("");
    const [etcTab, setEtcTab] = useState<'runes' | 'cubing'>('runes');

    // Monitor State
    const [displays, setDisplays] = useState<any[]>([]);
    const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(() => localStorage.getItem('selected-monitor-id'));

    // Derived states for convenience
    const isEditorOpen = viewMode === 'guide';
    const isRunewordOpen = viewMode === 'runeword';

    // Mutual Exclusion Handlers
    // Mutual Exclusion Handlers (Toggle Logic)
    const toggleEditor = () => {
        setViewMode((prev: string) => prev === 'guide' ? 'hud' : 'guide');
    };
    const toggleRunewords = () => {
        setViewMode((prev: string) => prev === 'runeword' ? 'hud' : 'runeword');
    };
    const closePanels = () => { setViewMode('hud'); }; // New function to close all panels

    // Persistent Position Saving (hud-pos는 저장하지 않음 - 매 실행 시 주모니터 중앙으로 강제 배치)

    useEffect(() => { localStorage.setItem('guide-pos', JSON.stringify(editorPos)); }, [editorPos]);
    useEffect(() => { localStorage.setItem('runepos', JSON.stringify(runewordPos)); }, [runewordPos]);
    useEffect(() => { localStorage.setItem('settings-pos', JSON.stringify(settingsPos)); }, [settingsPos]);
    useEffect(() => { localStorage.setItem('uiscale', uiScale.toString()); }, [uiScale]);
    useEffect(() => {
        if (selectedMonitorId) localStorage.setItem('selected-monitor-id', selectedMonitorId);
    }, [selectedMonitorId]);
    useEffect(() => { localStorage.setItem('hud-size', JSON.stringify(hudSize)); }, [hudSize]);
    useEffect(() => { localStorage.setItem('editor-size', JSON.stringify(editorSize)); }, [editorSize]);
    useEffect(() => { localStorage.setItem('runeword-size', JSON.stringify(runewordSize)); }, [runewordSize]);
    useEffect(() => { localStorage.setItem('settings-size', JSON.stringify(settingsSize)); }, [settingsSize]);


    // Auto Save to LocalStorage (Last Session Context) - source type 포함 저장
    useEffect(() => {
        localStorage.setItem('d2r-last-guide-id', guide.meta.id); // 레거시 호환 유지
        const session = {
            id: guide.meta.id,
            source_type: guide.meta.source_type || 'library',
            path: guide.meta.file_path || null
        };
        localStorage.setItem('d2r-last-session', JSON.stringify(session));
    }, [guide]);

    // 앱 시작 시 파일 기반 가이드 복원 (비동기 필요)
    useEffect(() => {
        if (!(window as any).require) return;
        const lastSession = localStorage.getItem('d2r-last-session');
        if (!lastSession) return;
        try {
            const session = JSON.parse(lastSession);
            if (session.source_type === 'file' && session.path) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.invoke('read-guide-file', session.path).then((data: any) => {
                    if (data) {
                        setGuide({ ...data, meta: { ...data.meta, source_type: 'file', file_path: session.path } });
                        setCurrentFilePath(session.path);
                    }
                }).catch(() => {
                    console.warn('마지막으로 열었던 파일을 찾을 수 없습니다:', session.path);
                });
            }
        } catch (e) { /* ignore */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 최초 마운트 시 1회만 실행

    // Update Guide Index
    useEffect(() => {
        localStorage.setItem('d2r-guides-index', JSON.stringify(savedGuides));
    }, [savedGuides]);

    // --- Auto-Hide Effects & Sync ---
    useEffect(() => {
        localStorage.setItem('d2r-autohide', JSON.stringify(autoHide));
        // Sync with Main Process
        if ((window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('toggle-auto-hide', autoHide);
        }
    }, [autoHide]);

    useEffect(() => {
        if ((window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            const handleCalibration = (_: any, data: { x: number; y: number; color: string }) => {
                console.log("[Renderer] Calibration Data Received:", data);
                setAutoHide((prev: any) => {
                    const newState = { ...prev, x: data.x, y: data.y, targetColor: data.color };
                    console.log("[Renderer] New Auto-Hide State:", newState);
                    return newState;
                });
                setIsCalibrating(false);
            };

            const handleCalibFailed = (_: any, msg: string) => {
                setIsCalibrating(false);
                alert("Calibration Failed: " + msg);
            };

            ipcRenderer.on('calibration-complete', handleCalibration);
            ipcRenderer.on('calibration-failed', handleCalibFailed);

            const handlePrimaryDisplay = (_: any, info: { x: number; y: number; width: number; height: number }) => {
                if (hasCenteredRef.current) return; // 이미 중앙 배치를 완료했다면 무시

                console.log("[Renderer] Forcing center position on startup:", info);
                const hudWidth = hudSize.width;
                const hudHeight = hudSize.height;

                // 주모니터 우측 상단에 배치 (32px 여백)
                const margin = 32;
                const rightX = info.x + info.width - (hudWidth * uiScale) - margin;
                const topY = info.y + margin;

                setHudPos({ x: rightX, y: topY });

                // 다른 패널들도 주모니터 중앙으로 리셋 (화면 밖으로 나가는 것 방지)
                const centerUI = (size: { width: number, height: number }) => ({
                    x: info.x + (info.width - size.width * uiScale) / 2,
                    y: info.y + (info.height - size.height * uiScale) / 2
                });

                setEditorPos(centerUI(editorSize));
                setRunewordPos(centerUI(runewordSize));
                setSettingsPos(centerUI(settingsSize));

                hasCenteredRef.current = true; // Mark as centered

                // 앱 시작 시 강제로 주모니터 ID로 설정 (index.js에서 초기화됨)
                const primId = (info as any).id?.toString() || "primary";
                setSelectedMonitorId(primId);
            };
            ipcRenderer.on('primary-display-info', handlePrimaryDisplay);

            const handleAllDisplays = (_: any, info: { displays: DisplayInfo[] }) => {
                console.log("[Renderer] All Displays Info:", info.displays);
                setDisplays(info.displays);
            };

            const handleCycleMonitor = () => {
                setHudPos((prev: { x: number; y: number }) => {
                    if (displays.length <= 1) return prev;

                    // Get current monitor
                    const currentMonitor = displays.find((d: any) =>
                        prev.x >= d.relativeX && prev.x < d.relativeX + d.bounds.width &&
                        prev.y >= d.relativeY && prev.y < d.relativeY + d.bounds.height
                    ) || displays[0];

                    const currentIndex = displays.findIndex((d: any) => d.id === currentMonitor.id);
                    const nextMonitor = displays[(currentIndex + 1) % displays.length];

                    setSelectedMonitorId(nextMonitor.id.toString());

                    // 모든 UI 요소를 새로운 모니터 중앙으로 이동
                    const moveUI = (size: { width: number, height: number }) => ({
                        x: nextMonitor.relativeX + (nextMonitor.bounds.width - size.width * uiScale) / 2,
                        y: nextMonitor.relativeY + (nextMonitor.bounds.height - size.height * uiScale) / 2
                    });

                    setEditorPos(moveUI(editorSize));
                    setRunewordPos(moveUI(runewordSize));
                    setSettingsPos(moveUI(settingsSize));

                    return moveUI(hudSize);
                });
            };

            const handleSnapToCorner = (_: any, corner: string) => {
                setHudPos((prev: { x: number; y: number }) => {
                    const currentMonitor = displays.find((d: any) => d.id.toString() === selectedMonitorId) ||
                        displays.find((d: any) =>
                            prev.x >= d.relativeX && prev.x < d.relativeX + d.bounds.width &&
                            prev.y >= d.relativeY && prev.y < d.relativeY + d.bounds.height
                        ) || displays[0];

                    if (!currentMonitor) return prev;

                    const w = hudSize.width * uiScale;
                    const h = hudSize.height * uiScale;
                    const margin = 8; // Snap margin

                    switch (corner) {
                        case 'top-left':
                            return { x: currentMonitor.relativeX + margin, y: currentMonitor.relativeY + margin };
                        case 'top-right':
                            return { x: currentMonitor.relativeX + currentMonitor.bounds.width - w - margin, y: currentMonitor.relativeY + margin };
                        case 'bottom-left':
                            return { x: currentMonitor.relativeX + margin, y: currentMonitor.relativeY + currentMonitor.bounds.height - h - margin };
                        case 'bottom-right':
                            return { x: currentMonitor.relativeX + currentMonitor.bounds.width - w - margin, y: currentMonitor.relativeY + currentMonitor.bounds.height - h - margin };
                        default:
                            return prev;
                    }
                });
            };

            ipcRenderer.on('calibration-complete', handleCalibration);
            ipcRenderer.on('calibration-failed', handleCalibFailed);
            ipcRenderer.on('primary-display-info', handlePrimaryDisplay);
            ipcRenderer.on('all-displays-info', handleAllDisplays);
            ipcRenderer.on('cycle-monitor', handleCycleMonitor);
            ipcRenderer.on('snap-to-corner', handleSnapToCorner);

            // 초기 로딩 시 모든 모니터 정보를 명시적으로 요청
            ipcRenderer.send('get-all-displays-info');
            ipcRenderer.send('get-primary-display-info');

            return () => {
                ipcRenderer.removeListener('calibration-complete', handleCalibration);
                ipcRenderer.removeListener('calibration-failed', handleCalibFailed);
                ipcRenderer.removeListener('primary-display-info', handlePrimaryDisplay);
                ipcRenderer.removeListener('all-displays-info', handleAllDisplays);
                ipcRenderer.removeListener('cycle-monitor', handleCycleMonitor);
                ipcRenderer.removeListener('snap-to-corner', handleSnapToCorner);
            };
        }
    }, [displays, uiScale, hudSize]); // Re-bind if displays or scale change

    const startCalibration = () => {
        setIsCalibrating(true);
        setCountdown(3);
    };

    useEffect(() => {
        if (countdown !== null && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (countdown === 0) {
            performCapture();
            setCountdown(null);
        }
    }, [countdown]);

    const performCapture = () => {
        if ((window as any).require) {
            try {
                const { ipcRenderer } = (window as any).require('electron');
                console.log("[Renderer] Requesting SNAP from Main Process...");
                ipcRenderer.send('snap-pixel-color');
            } catch (err: any) {
                console.error("[Renderer] Capture Error:", err);
                alert("Capture Error: " + err.message);
            }
        }
        setIsCalibrating(false);
    };

    const cancelCalibration = () => {
        setIsCalibrating(false);
        setCountdown(null);
    };

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isCalibrating) {
                cancelCalibration();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isCalibrating]);

    // --- Guide Management Logic ---
    const generateId = () => {
        return 'guide-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
    };

    const createNewGuide = () => {
        const title = prompt("새로운 가이드 이름을 입력하세요:", "나의 가이드");
        if (!title) return;

        const newGuide = EMPTY_GUIDE(title);
        setGuide(newGuide);
        setCurrentStepIndex(0);
        setCurrentFilePath(null);
        setViewMode('guide'); // 바로 에디터 오픈
    };

    const saveGuideAsFile = async () => {
        if (!(window as any).require) {
            alert("이 기능은 데스크톱 앱 버젼에서만 사용 가능합니다.");
            return;
        }

        try {
            const { ipcRenderer } = (window as any).require('electron');

            // Prepare guide data for file saving
            const fileGuide = {
                ...guide,
                meta: {
                    ...guide.meta,
                    source_type: 'file' as const
                }
            };

            const filePath = await ipcRenderer.invoke('save-guide-dialog', fileGuide);

            if (filePath) {
                const guideWithPath = {
                    ...fileGuide,
                    meta: {
                        ...fileGuide.meta,
                        file_path: filePath
                    }
                };

                // Update internal state
                setGuide(guideWithPath);
                setCurrentStepIndex(0);
                setCurrentFilePath(filePath);

                // Update index
                setSavedGuides((prev: any) => {
                    const filtered = prev.filter((g: any) => g.path !== filePath);
                    const newEntry = { id: guideWithPath.meta.id, title: guideWithPath.meta.title, path: filePath, source_type: 'file' };
                    const newIndex = [newEntry, ...filtered];
                    localStorage.setItem('d2r-guides-index', JSON.stringify(newIndex));
                    return newIndex;
                });

                showToast(`가이드가 파일로 저장되었습니다:\n${filePath}`);
            }
        } catch (err: any) {
            showToast("파일 저장 중 오류가 발생했습니다: " + err.message);
        }
    };

    const loadGuideFromFileWithPath = async (path: string) => {
        if (!(window as any).require) return;
        try {
            const { ipcRenderer } = (window as any).require('electron');
            const data = await ipcRenderer.invoke('read-guide-file', path);
            if (data) {
                const guideWithSource = {
                    ...data,
                    meta: {
                        ...data.meta,
                        source_type: 'file' as const,
                        file_path: path
                    }
                };
                setGuide(guideWithSource);
                setCurrentStepIndex(0);
                setCurrentFilePath(path);

                // Update index
                setSavedGuides((prev: any) => {
                    const filtered = prev.filter((g: any) => g.path !== path);
                    const newEntry = { id: guideWithSource.meta.id, title: guideWithSource.meta.title, path: path, source_type: 'file' };
                    const newIndex = [newEntry, ...filtered];
                    localStorage.setItem('d2r-guides-index', JSON.stringify(newIndex));
                    return newIndex;
                });
            }
        } catch (err: any) {
            alert("파일을 읽는 중 오류가 발생했습니다: " + err.message);
        }
    };

    const loadGuideFromFile = async () => {
        if (!(window as any).require) {
            alert("이 기능은 데스크톱 앱 버젼에서만 사용 가능합니다.");
            return;
        }

        try {
            const { ipcRenderer } = (window as any).require('electron');
            const result = await ipcRenderer.invoke('open-guide-dialog');

            if (result) {
                const { filePath, data } = result;
                const guideWithSource = {
                    ...data,
                    meta: {
                        ...data.meta,
                        source_type: 'file' as const,
                        file_path: filePath
                    }
                };
                setGuide(guideWithSource);
                setCurrentStepIndex(0);
                setCurrentFilePath(filePath);

                // Update index
                setSavedGuides((prev: any) => {
                    const filtered = prev.filter((g: any) => g.path !== filePath);
                    const newEntry = { id: guideWithSource.meta.id, title: guideWithSource.meta.title, path: filePath, source_type: 'file' };
                    const newIndex = [newEntry, ...filtered];
                    localStorage.setItem('d2r-guides-index', JSON.stringify(newIndex));
                    return newIndex;
                });

                alert(`가이드를 불러왔습니다:\n${filePath}`);
            }
        } catch (err: any) {
            alert("파일 열기 중 오류가 발생했습니다: " + err.message);
        }
    };


    const saveGuideAs = () => {
        const title = prompt("새 가이드의 제목을 입력하세요:", guide.meta.title);
        if (!title) return;

        const newId = Date.now().toString();
        const newGuide = {
            ...guide,
            meta: {
                ...guide.meta,
                id: newId,
                title: title,
                last_updated: new Date().toISOString().split('T')[0],
                source_type: 'local' as const,
                file_path: undefined
            }
        };

        localStorage.setItem(`d2r-guide-${newId}`, JSON.stringify(newGuide));

        setSavedGuides((prev: any) => {
            const newEntry = { id: newId, title: title, source_type: 'local' };
            const newIndex = [newEntry, ...prev];
            localStorage.setItem('d2r-guides-index', JSON.stringify(newIndex));
            return newIndex;
        });

        setGuide(newGuide);
        setCurrentFilePath(null);
        alert("새 가이드가 '내 저장소'에 저장되었습니다.");
    };

    const saveGuide = async () => {
        // --- Priority: Direct File Save ---
        if (currentFilePath && (window as any).require) {
            try {
                const { ipcRenderer } = (window as any).require('electron');
                const success = await ipcRenderer.invoke('save-guide-to-path', { filePath: currentFilePath, guideData: guide });
                if (success) {
                    showToast(`파일이 업데이트 되었습니다:\n${currentFilePath}`);
                    return;
                }
            } catch (err: any) {
                console.error("Direct save failed", err);
                // Fallback to library save or alert
            }
        }

        // Only allow overwriting for non-library guides
        const isLibrary = ALL_GUIDES.some(g => g.meta.id === guide.meta.id);
        if (isLibrary) {
            saveGuideAs();
            return;
        }

        localStorage.setItem(`d2r-guide-${guide.meta.id}`, JSON.stringify(guide));
        showToast("변경사항이 로컬에 저장되었습니다.");
    };

    const loadGuide = (id: string, options?: { source?: 'library' | 'local' | 'file', path?: string }) => {
        // 1. Explicit Source Logic
        if (options?.source === 'library') {
            const library = ALL_GUIDES.find(g => g.meta.id === id);
            if (library) {
                setGuide(library);
                setCurrentStepIndex(0);
                setCurrentFilePath(null);
                return;
            }
        }

        if (options?.source === 'file' && options.path) {
            loadGuideFromFileWithPath(options.path);
            return;
        }

        if (options?.source === 'local') {
            const content = localStorage.getItem(`d2r-guide-${id}`);
            if (content) {
                try {
                    const loadedGuide = JSON.parse(content);
                    setGuide(loadedGuide);
                    setCurrentStepIndex(0);
                    setCurrentFilePath(null);
                    return;
                } catch (e) {
                    console.error("Failed to load local guide", e);
                }
            }
        }

        // 2. Fallback (Legacy/Auto-detection)
        const library = ALL_GUIDES.find(g => g.meta.id === id);
        if (library) {
            setGuide(library);
            setCurrentStepIndex(0);
            setCurrentFilePath(null);
            return;
        }

        const content = localStorage.getItem(`d2r-guide-${id}`);
        if (content) {
            try {
                const loadedGuide = JSON.parse(content);
                setGuide(loadedGuide);
                setCurrentStepIndex(0);

                const entry = savedGuides.find((g: any) => g.id === id);
                if (entry && (entry as any).path) {
                    setCurrentFilePath((entry as any).path);
                } else {
                    setCurrentFilePath(null);
                }
            } catch (e) {
                console.error("Failed to load guide", e);
                alert("가이드 데이터를 불러오는데 실패했습니다.");
            }
        }
    };

    const resetToDefault = () => {
        if (window.confirm("현재 가이드를 초기화하고 기본 데이터로 복구하시겠습니까?\n내부적으로 저장된 커스텀 수정사항은 사라집니다.\n(나의 저장소에 따로 저장한 가이드는 유지됩니다)")) {
            // If it's a local guide, just switch back to default library guide
            // We don't delete the local guide, just return to library's default state
            localStorage.removeItem('d2r-last-guide-id');
            setGuide(DEFAULT_GUIDE);
            setCurrentStepIndex(0);
            alert("기본 가이드(퀘스트 타임라인)로 복구되었습니다.");
        }
    };

    const deleteGuide = (id: string, title: string, path?: string) => {
        if (window.confirm(`"${title}" 가이드를 목록에서 제거하시겠습니까?`)) {
            if (path) {
                // 파일 기반 가이드: path로 고유 식별
                setSavedGuides((prev: any[]) => prev.filter((g: any) => g.path !== path));
            } else {
                // 로컬 가이드: localStorage에서도 제거
                localStorage.removeItem(`d2r-guide-${id}`);
                setSavedGuides((prev: any[]) => prev.filter((g: any) => g.id !== id));
            }
        }
    };


    // Mouse Interaction Bridge (Electron Click-through)
    useEffect(() => {
        if ((window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');

            const handleMouseOver = (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                // Check if target or any parent is interactive (not the root container)
                const isInteractive = target.closest('.pointer-events-auto');
                if (isInteractive) {
                    ipcRenderer.send('set-ignore-mouse-events', false);
                } else {
                    ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
                }
            };

            window.addEventListener('mousemove', handleMouseOver);
            return () => window.removeEventListener('mousemove', handleMouseOver);
        }
    }, []);

    // IPC Sender Helper
    const ipcSend = (channel: string, ...args: any[]) => {
        if ((window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send(channel, ...args);
        }
    };

    // IPC Hooks (Electron Global Shortcuts)
    useEffect(() => {
        if ((window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            const handleNext = () => setCurrentStepIndex((prev: number) => Math.min(prev + 1, guide.steps.length - 1));
            const handlePrev = () => setCurrentStepIndex((prev: number) => Math.max(prev - 1, 0));
            ipcRenderer.on('next-step', handleNext);
            ipcRenderer.on('prev-step', handlePrev);
            return () => {
                ipcRenderer.removeListener('next-step', handleNext);
                ipcRenderer.removeListener('prev-step', handlePrev);
            };
        }
    }, [guide.steps.length]);

    // Hotkey Recording Logic
    const [isRecording, setIsRecording] = useState(false);
    useEffect(() => {
        if (!isRecording) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const modifiers = [];
            if (e.ctrlKey) modifiers.push('Control');
            if (e.shiftKey) modifiers.push('Shift');
            if (e.altKey) modifiers.push('Alt');
            if (e.metaKey) modifiers.push('Super'); // Windows key

            let key = e.key.toUpperCase();
            if (key === 'CONTROL' || key === 'SHIFT' || key === 'ALT' || key === 'META') return; // Ignore modifier-only presses

            // Electron Accelerator format
            const accelerator = [...modifiers, key].join('+');
            setToggleHotkey(accelerator);
            setIsRecording(false);

            // Save and Send to Electron
            localStorage.setItem('toggle-hotkey', accelerator);
            ipcSend('update-toggle-hotkey', accelerator);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isRecording]);

    // Initial Hotkey Sync
    useEffect(() => {
        ipcSend('update-toggle-hotkey', toggleHotkey);
    }, []);

    // Simple Drag Logic (Enhanced for Monitor/Resolution issues)
    const handleDrag = (e: React.MouseEvent, type: 'editor' | 'runeword' | 'hud' | 'settings') => {
        const startX = e.clientX;
        const startY = e.clientY;
        let startPos = { x: 0, y: 0 };
        if (type === 'editor') startPos = editorPos;
        else if (type === 'runeword') startPos = runewordPos;
        else if (type === 'settings') startPos = settingsPos;
        else startPos = hudPos;

        // Disable mouse-event-ignoring during drag to prevent cursor lost issues on monitor boundaries
        ipcSend('set-ignore-mouse-events', false);
        document.body.classList.add('dragging-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            const hudWidth = 300;
            const hudHeight = 400;

            let newX = startPos.x + (moveEvent.clientX - startX);
            let newY = startPos.y + (moveEvent.clientY - startY);

            // HUD 및 패널의 경우 선택된 모니터 영역 내로 강력하게 제한
            if (displays.length > 0) {
                // 선택된 모니터 찾기 (없으면 현재 마우스 위치나 첫 번째 모니터)
                let currentMonitor = displays.find((d: any) => d.id.toString() === selectedMonitorId);

                if (!currentMonitor) {
                    currentMonitor = displays.find((d: any) =>
                        moveEvent.clientX >= d.relativeX && moveEvent.clientX < d.relativeX + d.bounds.width &&
                        moveEvent.clientY >= d.relativeY && moveEvent.clientY < d.relativeY + d.bounds.height
                    ) || displays[0];
                    if (currentMonitor) setSelectedMonitorId(currentMonitor.id.toString());
                }

                const targetW = (type === 'editor' ? editorSize.width : (type === 'runeword' ? runewordSize.width : (type === 'settings' ? settingsSize.width : hudSize.width))) * uiScale;
                // HUD는 가변 높이이므로 드래그 시 실제 높이 대신 적절한 최소/최대값 제한 (상단 고정 방지)
                const targetH = (type === 'hud' ? 100 : (type === 'editor' ? editorSize.height : (type === 'runeword' ? runewordSize.height : (type === 'settings' ? settingsSize.height : hudSize.height)))) * uiScale;

                const minX = currentMonitor.relativeX - 100; // 화면 밖으로 약간 나갈 수 있도록 허용
                const minY = currentMonitor.relativeY - 50;
                const maxX = currentMonitor.relativeX + currentMonitor.bounds.width - 50;
                const maxY = currentMonitor.relativeY + currentMonitor.bounds.height - 50;

                newX = Math.max(minX, Math.min(maxX, newX));
                newY = Math.max(minY, Math.min(maxY, newY));
            }

            if (type === 'editor') setEditorPos({ x: newX, y: newY });
            else if (type === 'runeword') setRunewordPos({ x: newX, y: newY });
            else if (type === 'settings') setSettingsPos({ x: newX, y: newY });
            else setHudPos({ x: newX, y: newY });
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.classList.remove('dragging-active');

            // Re-enable mouse-event-ignoring after drag (if the mouse is not over UI)
            // The existing mousemove listener will catch this automatically,
            // but we call it here to be safe and immediate.
            const targetUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
            const isInteractive = targetUnderMouse?.closest('.pointer-events-auto');
            if (!isInteractive) {
                ipcSend('set-ignore-mouse-events', true, { forward: true });
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // Generic Resize Logic for multiple panels
    const handleResize = (e: React.MouseEvent, direction: 'width' | 'height' | 'both', type: 'hud' | 'editor' | 'runeword' | 'settings' = 'hud') => {
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;

        // Target size and dispatcher
        let startWidth = 0;
        let startHeight = 0;
        let setSize: (size: { width: number; height: number }) => void;
        let minW = 250;
        let minH = 200;

        if (type === 'editor') {
            startWidth = editorSize.width;
            startHeight = editorSize.height;
            setSize = setEditorSize;
            minW = 350; minH = 400;
        } else if (type === 'runeword') {
            startWidth = runewordSize.width;
            startHeight = runewordSize.height;
            setSize = setRunewordSize;
            minW = 300; minH = 400;
        } else if (type === 'settings') {
            startWidth = settingsSize.width;
            startHeight = settingsSize.height;
            setSize = setSettingsSize;
            minW = 200; minH = 300;
        } else {
            startWidth = hudSize.width;
            startHeight = hudSize.height;
            setSize = setHudSize;
            minW = 250; minH = 200;
        }

        ipcSend('set-ignore-mouse-events', false);
        document.body.classList.add('dragging-active');

        let newWidth = startWidth;
        let newHeight = startHeight;

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (direction === 'width' || direction === 'both') {
                newWidth = Math.max(minW, startWidth + (moveEvent.clientX - startX) / uiScale);
            }
            if (direction === 'height' || direction === 'both') {
                newHeight = Math.max(minH, startHeight + (moveEvent.clientY - startY) / uiScale);
            }
            setSize({ width: newWidth, height: newHeight });
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.classList.remove('dragging-active');

            const targetUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
            const isInteractive = targetUnderMouse?.closest('.pointer-events-auto');
            if (!isInteractive) {
                ipcSend('set-ignore-mouse-events', true, { forward: true });
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // Handlers
    const updateMeta = (field: keyof Guide['meta'], value: string) => {
        setGuide((prev: Guide) => ({
            ...prev,
            meta: { ...prev.meta, [field]: value, last_updated: new Date().toISOString().split('T')[0] }
        }));
    };

    const updateStep = (index: number, field: keyof Step, value: any) => {
        setGuide((prev: Guide) => {
            const newSteps = [...prev.steps];
            const currentValue = newSteps[index][field];
            const newValue = typeof value === 'function' ? value(currentValue) : value;
            newSteps[index] = { ...newSteps[index], [field]: newValue };
            return { ...prev, steps: newSteps };
        });
    };

    const addStep = () => {
        const newStep: Step = {
            index: guide.steps.length,
            condition: { type: "LEVEL", value: guide.steps.length + 1 },
            location: "New Location",
            tasks: [],
            note: ""
        };
        setGuide((prev: Guide) => ({ ...prev, steps: [...prev.steps, newStep] }));
        setCurrentStepIndex(guide.steps.length);
    };

    const removeStep = (index: number) => {
        if (guide.steps.length <= 1) return;
        const newSteps = guide.steps.filter((_: Step, i: number) => i !== index).map((s: Step, i: number) => ({ ...s, index: i }));
        setGuide((prev: Guide) => ({ ...prev, steps: newSteps }));
        setCurrentStepIndex(Math.max(0, currentStepIndex - 1));
    };

    // Firebase Logic
    const filteredRunewords = runewordData.filter(r =>
        r.name.includes(searchRune) ||
        r.original_name.toLowerCase().includes(searchRune.toLowerCase()) ||
        r.runes.some(rn => rn.includes(searchRune)) ||
        r.item_types.some(it => it.includes(searchRune))
    );

    const filteredCubing = (cubingData as CubingRecipe[]).filter(c =>
        c.name.includes(searchRune) ||
        c.recipe.includes(searchRune) ||
        c.result.includes(searchRune) ||
        c.category.includes(searchRune) ||
        (c.runes && c.runes.some(rn => rn.includes(searchRune)))
    );

    const saveLocal = () => {
        localStorage.setItem('d2r-guide', JSON.stringify(guide));
        alert("로컬 저장 완료!");
    };


    const currentStep = guide.steps[currentStepIndex] || guide.steps[0];

    return (
        <div className="fixed inset-0 bg-transparent text-white font-sans overflow-hidden pointer-events-none" style={{ zoom: uiScale } as any}>
            {/* Global Navigation Removed (Integrated into headers) */}


            {/* UI Windows */}
            {/* Guide View - Enhanced with Sidebar */}
            {isEditorOpen && (
                <div className="fixed flex flex-col pointer-events-auto bg-slate-950 rounded border border-slate-800 shadow-xl overflow-hidden p-0 ring-1 ring-white/5 select-none"
                    style={{ left: editorPos.x / uiScale, top: editorPos.y / uiScale, width: `${editorSize.width}px`, height: `${editorSize.height}px`, zIndex: 52 }}>

                    {/* Resize Handles */}
                    <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 hover:opacity-100 bg-amber-500/20 z-50 transition-opacity" onMouseDown={(e: React.MouseEvent) => handleResize(e, 'width', 'editor')} />
                    <div className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize opacity-0 hover:opacity-100 bg-amber-500/20 z-50 transition-opacity rounded-b" onMouseDown={(e: React.MouseEvent) => handleResize(e, 'height', 'editor')} />
                    <div className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize opacity-0 hover:opacity-100 bg-amber-500/50 z-50 transition-opacity rounded-br" onMouseDown={(e: React.MouseEvent) => handleResize(e, 'both', 'editor')} />

                    {/* Header: 1행=제목+닫기(드래그), 2행=드롭다운(전체너비), 3행=저장버튼 */}
                    <div className="flex flex-col bg-slate-900 border-b border-slate-800/50 select-none">
                        {/* 1행: 드래그 영역 */}
                        <div className="flex justify-between items-center px-3 pt-2 pb-1 cursor-move"
                            onMouseDown={(e) => handleDrag(e, 'editor')}>
                            <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">가이드 관리</span>
                            <button onClick={closePanels} onMouseDown={(e) => e.stopPropagation()} className="text-slate-500 hover:text-white transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {/* 2행: 전체 너비 드롭다운 */}
                        <div className="px-3 pb-1" onMouseDown={(e) => e.stopPropagation()}>
                            <select
                                className="w-full bg-slate-950 border border-amber-600/30 text-[10px] text-amber-400 rounded px-2 py-1 outline-none focus:border-amber-500 font-bold cursor-pointer"
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                    const val = e.target.value;
                                    if (val.startsWith('file:')) {
                                        loadGuideFromFileWithPath(val.slice(5));
                                    } else {
                                        loadGuide(val);
                                    }
                                }}
                                value={currentFilePath ? `file:${currentFilePath}` : guide.meta.id}
                            >
                                <optgroup label="기본 라이브러리">
                                    <option value={DEFAULT_GUIDE.meta.id}>퀘스트 타임라인</option>
                                    <option value={ABYSS_WARLOCK.meta.id}>어비스 워록 (레벨링)</option>
                                </optgroup>
                                {savedGuides.some((g: any) => !g.path) && (
                                    <optgroup label="내 로컬 저장">
                                        {savedGuides.filter((g: any) => !g.path).map((g: any) => (
                                            <option key={g.id} value={g.id}>{g.title}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {savedGuides.some((g: any) => g.path) && (
                                    <optgroup label="파일 가이드">
                                        {savedGuides.filter((g: any) => g.path).map((g: any) => {
                                            const fileName = g.path.split(/[\\\/]/).pop() || g.path;
                                            return (
                                                <option key={g.path} value={`file:${g.path}`}>
                                                    📄 {fileName}
                                                </option>
                                            );
                                        })}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                        {/* 3행: 버튼들 */}
                        <div className="flex items-center gap-1.5 px-3 pb-2" onMouseDown={(e) => e.stopPropagation()}>
                            {(window as any).require && (
                                <button onClick={loadGuideFromFile} className="text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-0.5 rounded border border-slate-700 transition-colors">열기</button>
                            )}
                            <button onClick={saveGuide} className="text-[9px] bg-amber-600 text-black px-3 py-0.5 rounded font-black uppercase hover:bg-amber-500 transition-colors shadow-sm">저장</button>
                            <button onClick={saveGuideAs} className="text-[9px] bg-slate-800 hover:bg-slate-700 text-amber-500 px-3 py-0.5 rounded border border-slate-700 transition-colors">복사</button>
                            {(window as any).require && (
                                <button onClick={saveGuideAsFile} className="text-[9px] bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-0.5 rounded shadow-lg transition-colors font-bold">파일저장</button>
                            )}
                            {/* 파일 가이드인 경우 삭제 버튼 */}
                            {currentFilePath && (
                                <button
                                    onClick={() => {
                                        const fileName = currentFilePath.split(/[\\\/]/).pop() || currentFilePath;
                                        if (confirm(`"${fileName}" 을(를) 목록에서 제거하시겠습니까?\n(실제 파일은 삭제되지 않습니다)`)) {
                                            const entry = savedGuides.find((g: any) => g.path === currentFilePath);
                                            if (entry) deleteGuide(entry.id, entry.title, currentFilePath);
                                            setCurrentFilePath(null);
                                        }
                                    }}
                                    className="text-[9px] bg-slate-800 hover:bg-red-900/40 text-red-500 hover:text-red-400 px-3 py-0.5 rounded border border-red-900/40 hover:border-red-900/50 transition-colors ml-auto"
                                    title="목록에서 이 파일 가이드 제거"
                                >삭제</button>
                            )}
                        </div>
                        {/* 파일저장 안내 문구 */}
                        {(window as any).require && (
                            <p className="text-[8px] text-slate-600 px-3 pb-2 leading-tight">
                                파일저장 후 JSON을 직접 편집하고 열기로 불러올 수 있습니다.
                            </p>
                        )}
                    </div>

                    <div className="flex flex-1 overflow-hidden">
                        {/* Step List Sidebar */}
                        <div className="w-[140px] bg-slate-950 border-r border-white/5 flex flex-col">
                            <div className="p-2 border-b border-white/5 bg-slate-900/30">
                                <button onClick={addStep} className="w-full py-1 text-[9px] bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 rounded hover:bg-indigo-600 hover:text-white transition-all font-bold uppercase">+ 새 단계 추가</button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-1 space-y-0.5">
                                {guide.steps.map((step: Step, idx: number) => (
                                    <div key={idx}
                                        onClick={() => setCurrentStepIndex(idx)}
                                        className={`px-2 py-1.5 rounded cursor-pointer transition-all border ${currentStepIndex === idx ? 'bg-amber-600/20 border-amber-600/50 text-amber-100' : 'bg-transparent border-transparent text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`text-[9px] font-black ${currentStepIndex === idx ? 'text-amber-500' : 'text-slate-600'}`}>#{idx + 1}</span>
                                            <span className="text-[9px] truncate font-medium">{step.location || 'Untitled'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col bg-slate-900/20 overflow-hidden">
                            {/* Fixed Buttons at Top */}
                            <div className="p-3 pb-2 border-b border-white/5 flex gap-2 bg-slate-900/40">
                                <button onClick={saveGuide} className="flex-1 bg-amber-600 text-black text-[9px] py-1.5 rounded font-black uppercase hover:bg-amber-500 transition-colors">변경사항 저장</button>
                                <button onClick={() => removeStep(currentStepIndex)} className="px-3 bg-red-900/20 text-red-500 text-[9px] py-1.5 rounded font-black uppercase border border-red-900/30 hover:bg-red-900/40">단계 삭제</button>
                                <button onClick={resetToDefault} className="px-3 bg-slate-800 text-slate-400 text-[9px] py-1.5 rounded font-black uppercase border border-slate-700 hover:text-white">초기화</button>
                            </div>

                            {/* Scrollable Content Area */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-500 uppercase font-black tracking-widest px-1">위치 (Location)</label>
                                    <input
                                        value={currentStep.location}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateStep(currentStepIndex, 'location', e.target.value)}
                                        className="w-full bg-slate-900 border border-white/5 rounded p-2 text-[11px] text-amber-500 font-bold focus:border-amber-600/50 outline-none select-text pointer-events-auto"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-500 uppercase font-black tracking-widest px-1">목표 (Objectives)</label>
                                    <div className="space-y-1.5 bg-slate-900/50 p-2 rounded border border-white/5">
                                        {(currentStep.tasks || []).map((task: Task, tidx: number) => (
                                            <div key={tidx} className="flex gap-2 items-start">
                                                <textarea
                                                    value={task.text}
                                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                                                        updateStep(currentStepIndex, 'tasks', (prevTasks: Task[]) => {
                                                            const newTasks = [...prevTasks];
                                                            newTasks[tidx] = { ...newTasks[tidx], text: e.target.value };
                                                            return newTasks;
                                                        });
                                                    }}
                                                    className="flex-1 bg-slate-900/50 border border-white/5 rounded px-2 py-1 text-[11px] outline-none focus:border-white/20 select-text pointer-events-auto resize-none custom-scrollbar"
                                                    rows={2}
                                                    placeholder="할 일 내용 (엔터 가능)"
                                                />
                                                <button onClick={() => { updateStep(currentStepIndex, 'tasks', (prevTasks: Task[]) => prevTasks.filter((_: Task, i: number) => i !== tidx)); }} className="text-slate-700 hover:text-red-500 text-[10px]">✕</button>
                                            </div>
                                        ))}
                                        <button onClick={() => { updateStep(currentStepIndex, 'tasks', (prevTasks: Task[]) => [...(prevTasks || []), { text: "", is_checked: false }]); }} className="w-full py-1 text-[9px] text-slate-500 hover:text-amber-500 transition-colors uppercase font-bold">+ 할 일 추가</button>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-500 uppercase font-black tracking-widest px-1">상세 노트 (Notes)</label>
                                    <textarea
                                        value={currentStep.note}
                                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateStep(currentStepIndex, 'note', e.target.value)}
                                        className="w-full h-24 bg-slate-900 border border-white/5 rounded p-2 text-[11px] text-slate-300 outline-none focus:border-white/20 resize-none custom-scrollbar select-text pointer-events-auto"
                                        placeholder="노트 내용을 입력하세요..."
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-500 uppercase font-black tracking-widest px-1">전략적 팁 (Tips)</label>
                                    <textarea
                                        value={currentStep.strategic_tip || ''}
                                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateStep(currentStepIndex, 'strategic_tip', e.target.value)}
                                        className="w-full bg-slate-900 border border-white/5 rounded p-2 text-[11px] text-indigo-300 min-h-[60px] focus:border-indigo-500/30 outline-none resize-none select-text pointer-events-auto"
                                        placeholder="선택 사항: 포지셔닝이나 스킬 활용 팁..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* HUD View - Always Visible */}
            <div className="fixed bg-slate-950/98 rounded border border-slate-800 shadow-lg no-drag pointer-events-auto ring-1 ring-white/5 flex flex-col select-none"
                style={{ left: hudPos.x / uiScale, top: hudPos.y / uiScale, width: `${hudSize.width}px`, visibility: 'visible' }}>

                {/* Resize Handles (HUD는 자동 높이이므로 가로폭만 조절 가능) */}
                <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 hover:opacity-100 bg-amber-500/20 z-50 transition-opacity" onMouseDown={(e: React.MouseEvent) => handleResize(e, 'width')} />
                <div className="bg-slate-900/90 pl-3 py-3 pr-28 flex justify-between items-start cursor-move border-b border-slate-800/80 relative"
                    onMouseDown={(e) => handleDrag(e, 'hud')}>
                    {/* Editor Toggle */}
                    <div className="absolute top-1 right-22 z-50">
                        <button onClick={toggleEditor} className={`p-1 rounded transition-all ${isEditorOpen ? 'text-amber-400 bg-amber-500/20' : 'text-slate-400 hover:text-amber-400 hover:bg-amber-500/20'}`} title="가이드 선택">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        </button>
                    </div>

                    {/* Rune Toggle */}
                    <div className="absolute top-1 right-15 z-50">
                        <button onClick={toggleRunewords} title="기타 (룬워드/큐빙)" className={`p-1 rounded transition-all ${isRunewordOpen ? 'text-indigo-400 bg-indigo-500/20 shadow-[0_0_10px_rgba(79,70,229,0.3)]' : 'text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        </button>
                    </div>

                    {/* Settings Button (Top Right - Left of Exit) */}
                    <div className="absolute top-1 right-8 z-50">
                        <button onClick={() => setShowSettings(!showSettings)} className={`p-1 rounded transition-all ${showSettings ? 'text-amber-400 bg-amber-500/20' : 'text-slate-400 hover:text-amber-400 hover:bg-amber-500/20'}`} title="설정">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </button>
                    </div>

                    {/* Exit Button (Top Right) */}
                    <div className="absolute top-1 right-1 z-50">
                        <button onClick={() => ipcSend('quit-app')} className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-all" title="종료 (Ctrl+Q로 숨기기)">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="flex flex-col flex-1 truncate pr-6">
                        <h1 className="text-sm font-black text-amber-500 truncate uppercase tracking-tight leading-none mb-1.5">{guide.meta.title}</h1>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                            <span className="text-[10px] text-slate-400 font-bold uppercase truncate tracking-wide">{currentStep.location}</span>
                        </div>
                    </div>
                    <div className="bg-black/40 px-2 py-1.5 rounded border border-slate-700/50 text-center min-w-[32px] ml-2 group-hover:border-amber-600/30 transition-colors">
                        <div className="text-xs font-black text-white leading-none">{currentStepIndex + 1}</div>
                        <div className="text-[6px] text-slate-500 font-black uppercase mt-0.5 tracking-tighter">단계</div>
                    </div>
                </div>


                <div className="flex border-b border-slate-800" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    <button onClick={() => setCurrentStepIndex((prev: number) => Math.max(0, prev - 1))} disabled={currentStepIndex === 0} className="flex-1 py-1.5 text-[9px] font-bold text-slate-600 hover:text-white hover:bg-white/5 border-r border-slate-800 transition-colors disabled:opacity-10 uppercase">이전</button>
                    <button onClick={() => setCurrentStepIndex((prev: number) => Math.min(guide.steps.length - 1, prev + 1))} disabled={currentStepIndex === guide.steps.length - 1} className="flex-1 py-1.5 text-[9px] font-bold text-amber-600 hover:bg-amber-600 hover:text-white transition-colors disabled:opacity-10 uppercase">다음</button>
                </div>
                {/* Content Section - Auto Height */}
                <div className="relative flex flex-col" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    <div className="p-4 bg-slate-950/20 pb-4">
                        {currentStep.route && (
                            <div className="mb-3 p-2 bg-amber-600/5 border border-amber-600/20 rounded-lg flex gap-2 items-start shadow-inner">
                                <div className="mt-0.5 text-amber-500/80 flex-shrink-0 animate-pulse">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                                </div>
                                <p className="text-[10px] text-amber-100/90 font-black uppercase tracking-tight leading-snug whitespace-pre-wrap">{currentStep.route}</p>
                            </div>
                        )}
                        <div className="space-y-2">
                            {currentStep.tasks.map((task: Task, idx: number) => (
                                <div key={idx} className="flex items-start gap-2.5 group cursor-pointer" onClick={() => { updateStep(currentStepIndex, 'tasks', (prevTasks: Task[]) => { const newTasks = [...prevTasks]; newTasks[idx] = { ...newTasks[idx], is_checked: !newTasks[idx].is_checked }; return newTasks; }); }}>
                                    <div className={`mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded border transition-all flex items-center justify-center ${task.is_checked ? 'bg-green-700/80 border-green-600' : 'bg-slate-900 border-slate-700 group-hover:border-amber-600'}`}>
                                        {task.is_checked && <span className="text-[9px] text-white">✓</span>}
                                    </div>
                                    <p className={`text-[12px] leading-tight whitespace-pre-wrap transition-colors ${task.is_checked ? 'text-slate-600 line-through italic' : 'text-slate-300'}`}>{task.text}</p>
                                </div>
                            ))}
                            {currentStep.tasks.length === 0 && <div className="text-[10px] text-slate-700 italic text-center py-2 uppercase tracking-wide">할 일 없음</div>}
                        </div>
                    </div>

                    {currentStep.note && (
                        <div className="px-4 pb-2">
                            <div className="bg-amber-600/5 border-l border-amber-600/50 p-2 py-1.5 rounded-r">
                                <p className="text-[11px] text-amber-100/60 italic leading-snug whitespace-pre-wrap">{currentStep.note}</p>
                            </div>
                        </div>
                    )}

                    {currentStep.strategic_tip && (
                        <div className="mx-4 mb-2 p-3 bg-indigo-950/30 rounded border border-indigo-500/20 animate-in fade-in slide-in-from-bottom-2 duration-700">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] text-indigo-400 font-black tracking-widest uppercase">전략적 팁 (Strategic Tip)</span>
                            </div>
                            <p className="text-[11px] text-indigo-100/90 leading-relaxed font-medium whitespace-pre-wrap">{currentStep.strategic_tip}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Etc View (Runewords / Cubing) - HUD Style Compact */}
            {isRunewordOpen && (
                <div className="fixed flex flex-col pointer-events-auto bg-slate-900/95 rounded border border-slate-700 shadow-2xl overflow-hidden ring-1 ring-white/10 select-none"
                    style={{ left: runewordPos.x / uiScale, top: runewordPos.y / uiScale, width: `${runewordSize.width}px`, height: `${runewordSize.height}px`, zIndex: 51 }}>

                    {/* Resize Handles */}
                    <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 hover:opacity-100 bg-blue-500/20 z-50 transition-opacity" onMouseDown={(e: React.MouseEvent) => handleResize(e, 'width', 'runeword')} />
                    <div className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize opacity-0 hover:opacity-100 bg-blue-500/20 z-50 transition-opacity rounded-b" onMouseDown={(e: React.MouseEvent) => handleResize(e, 'height', 'runeword')} />
                    <div className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize opacity-0 hover:opacity-100 bg-blue-500/50 z-50 transition-opacity rounded-br" onMouseDown={(e: React.MouseEvent) => handleResize(e, 'both', 'runeword')} />

                    <div className="flex justify-between items-center px-4 py-2 bg-slate-900 border-b border-slate-800/50 cursor-move select-none"
                        onMouseDown={(e: React.MouseEvent) => handleDrag(e, 'runeword')}>
                        <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">기타 (룬워드/큐빙)</span>
                        <button onClick={closePanels} className="text-slate-400 hover:text-white hover:bg-white/10 p-1.5 rounded transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="flex border-b border-white/5 bg-slate-900/40">
                        <button onClick={() => setEtcTab('runes')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-tighter transition-all ${etcTab === 'runes' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300'}`}>룬워드</button>
                        <button onClick={() => setEtcTab('cubing')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-tighter transition-all ${etcTab === 'cubing' ? 'text-amber-500 border-b-2 border-amber-500 bg-amber-500/5' : 'text-slate-500 hover:text-slate-300'}`}>큐빙 공식</button>
                    </div>

                    <div className="p-2 border-b border-white/5 bg-slate-900/40">
                        <input
                            type="text"
                            placeholder="룬, 아이템, 공식 키워드"
                            value={searchRune}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchRune(e.target.value)}
                            className="w-full bg-slate-950 border border-white/10 rounded px-3 py-2 text-[12px] text-white focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 select-text pointer-events-auto"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                        {etcTab === 'runes' ? (
                            filteredRunewords.map((r, i) => (
                                <div key={i} className="bg-slate-900/50 p-2.5 rounded border border-white/5 hover:border-indigo-500/30 transition-all group">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <h3 className="text-[13px] font-black text-white uppercase italic group-hover:text-indigo-400 transition-colors">{r.name}</h3>
                                            <span className="text-[10px] text-slate-500 font-bold uppercase">{r.original_name}</span>
                                        </div>
                                        <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-black">LVL {r.level}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {r.runes.map((rn, ri) => (
                                            <div key={ri} className="flex flex-col items-center gap-0.5">
                                                {getRuneImageUrl(rn) && (
                                                    <img src={getRuneImageUrl(rn)!} alt={rn} className="w-6 h-6 object-contain" />
                                                )}
                                                <span className="text-[9px] bg-indigo-900/30 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/10 font-black italic">#{rn}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-[11px] text-slate-400 space-y-1 opacity-80 group-hover:opacity-100">
                                        {r.stats.slice(0, 4).map((st, si) => (
                                            <div key={si} className="flex gap-1.5 items-start">
                                                <span className="text-indigo-600 font-bold">•</span>
                                                <span className="">{st}</span>
                                            </div>
                                        ))}
                                        {r.stats.length > 4 && <p className="text-[9px] text-slate-600 pl-3">+{r.stats.length - 4}개 효과 더보기...</p>}
                                    </div>
                                    <div className="mt-2.5 pt-2.5 border-t border-white/5">
                                        <p className="text-[10px] text-amber-600/80 font-bold italic">{r.material_sources}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            filteredCubing.map((c, i) => (
                                <div key={i} className="bg-slate-900/50 p-3 rounded border border-white/5 hover:border-amber-500/30 transition-all group">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-[12px] font-black text-amber-500 uppercase tracking-tighter">{c.name}</h3>
                                        <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-bold uppercase">{c.category}</span>
                                    </div>
                                    <div className="bg-black/20 p-2 rounded border border-white/5 mb-2">
                                        <p className="text-[11px] text-slate-300 font-bold mb-1">조합: {c.recipe}</p>
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {c.recipe.split(' + ').map((part, idx) => {
                                                const icon = getItemImageUrl(part.trim());
                                                return icon ? (
                                                    <div key={idx} className="bg-slate-800 p-0.5 rounded border border-white/10" title={part}>
                                                        <img src={icon} alt={part} className="w-5 h-5 object-contain" />
                                                    </div>
                                                ) : null;
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-1.5">
                                        <div className="mt-1 text-green-500">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                        <p className="text-[11px] text-green-400/90 font-bold uppercase tracking-tight">결과: {c.result}</p>
                                    </div>
                                    {c.description && (
                                        <p className="mt-2 text-[10px] text-slate-500 leading-snug italic">{c.description}</p>
                                    )}
                                </div>
                            ))
                        )}
                        {((etcTab === 'runes' && filteredRunewords.length === 0) || (etcTab === 'cubing' && filteredCubing.length === 0)) && (
                            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-lg">
                                <div className="text-slate-800 text-[11px] font-black uppercase tracking-widest">검색 결과 없음</div>
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* Settings Window */}
            {
                showSettings && (
                    <div className="fixed w-[280px] bg-slate-950 border border-slate-800 shadow-xl rounded overflow-hidden z-[100] pointer-events-auto ring-1 ring-white/10 flex flex-col select-none"
                        style={{ left: settingsPos.x / uiScale, top: settingsPos.y / uiScale }}>
                        {/* Header */}
                        <div className="flex justify-between items-center px-3 py-2 bg-slate-900 border-b border-slate-800/80 cursor-move"
                            onMouseDown={(e: React.MouseEvent) => handleDrag(e, 'settings')}>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">환경 설정</span>
                                <span className="text-[9px] text-slate-600 font-mono">{APP_VERSION}</span>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white hover:bg-white/10 p-1 rounded transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {/* Data Management (Reset Button) */}
                            <div className="pb-4 border-b border-slate-800">
                                <button
                                    onClick={resetToDefault}
                                    className="w-full py-2 bg-red-950/20 hover:bg-red-900/30 text-red-400 border border-red-900/50 rounded text-[9px] font-bold uppercase transition-all"
                                >
                                    기본 가이드로 초기화
                                </button>
                                <p className="text-[8px] text-slate-600 mt-1 leading-tight">새로운 데이터가 반영되지 않을 경우 초기화해 주세요.</p>
                            </div>

                            <div>
                                <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">HUD 토글 단축키</label>
                                <button
                                    onClick={() => setIsRecording(true)}
                                    className={`w-full py-1.5 px-3 rounded text-[11px] font-mono border transition-all text-center
                                        ${isRecording
                                            ? 'bg-red-500/10 border-red-500/50 text-red-500 animate-pulse'
                                            : 'bg-slate-900 border-slate-800 text-amber-500 hover:border-amber-500/50'
                                        }`}
                                >
                                    {isRecording ? '아이콘 클릭 후 키 입력...' : toggleHotkey}
                                </button>
                            </div>

                            {/* 구버전 사용자용 수동 업데이트 안내 */}
                            {!(window as any).require && (
                                <div className="pt-4 border-t border-slate-800">
                                    <label className="block text-[10px] text-slate-500 uppercase font-bold mb-2">신규 버전 수동 업데이트</label>
                                    <div className="bg-amber-950/20 border border-amber-900/40 rounded p-2.5 space-y-2">
                                        <p className="text-[9px] text-amber-200/90 leading-relaxed font-medium">
                                            브라우저 버전에서는 자동 업데이트가 제한됩니다. 최신 파일을 직접 다운로드해 주세요.
                                        </p>
                                        <a
                                            href="https://github.com/yobi7979/D2R-HUD/releases"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-black text-center text-[10px] font-black uppercase rounded transition-colors"
                                        >
                                            GitHub에서 다운로드
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* Update Section - Electron only */}
                            {(window as any).require && (
                                <div className="pt-4 border-t border-slate-800">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] text-slate-500 font-bold uppercase">앱 업데이트</span>
                                        {updateStatus === 'idle' || updateStatus === 'up-to-date' || updateStatus === 'error' ? (
                                            <button
                                                onClick={async () => {
                                                    setUpdateStatus('checking');
                                                    setUpdateInfo(null);
                                                    try {
                                                        const { ipcRenderer } = (window as any).require('electron');
                                                        // 다운로드 진행률 리스너 (강화된 데이터 구조 대응)
                                                        ipcRenderer.removeAllListeners('update-download-progress');
                                                        ipcRenderer.on('update-download-progress', (_: any, data: any) => {
                                                            if (typeof data === 'number') {
                                                                setDownloadProgress(data);
                                                            } else if (data && typeof data.percent === 'number') {
                                                                setDownloadProgress(data.percent);
                                                                if (data.status === 'error') {
                                                                    setUpdateStatus('error');
                                                                    setUpdateInfo((prev: any) => ({ ...prev, error: data.message }));
                                                                }
                                                            }
                                                        });
                                                        const info = await ipcRenderer.invoke('check-update');
                                                        setUpdateInfo(info);
                                                        setUpdateStatus(info.hasUpdate ? 'available' : 'up-to-date');
                                                    } catch (e: any) {
                                                        setUpdateInfo({ error: e.message });
                                                        setUpdateStatus('error');
                                                    }
                                                }}
                                                className="text-[8px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700 transition-colors"
                                            >업데이트 확인</button>
                                        ) : null}
                                    </div>

                                    {/* 상태 메시지 */}
                                    {updateStatus === 'checking' && (
                                        <p className="text-[9px] text-slate-500 animate-pulse">GitHub에서 버전 확인 중...</p>
                                    )}
                                    {updateStatus === 'up-to-date' && (
                                        <p className="text-[9px] text-green-600">✓ 최신 버전입니다 ({updateInfo?.currentVersion})</p>
                                    )}
                                    {updateStatus === 'error' && (
                                        <p className="text-[9px] text-red-500">오류: {updateInfo?.error}</p>
                                    )}
                                    {updateStatus === 'available' && updateInfo && (
                                        <div className="bg-slate-900 rounded border border-amber-600/20 p-2 space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[9px] text-amber-400 font-bold">{updateInfo.releaseName} 업데이트 가능</span>
                                                <span className="text-[8px] text-slate-600">{updateInfo.currentVersion} → {updateInfo.latestVersion}</span>
                                            </div>
                                            {updateInfo.releaseNotes && (
                                                <p className="text-[8px] text-slate-500 leading-tight line-clamp-3">{updateInfo.releaseNotes}</p>
                                            )}
                                            {updateInfo.downloadUrl ? (
                                                <button
                                                    onClick={async () => {
                                                        setUpdateStatus('downloading');
                                                        setDownloadProgress(0);
                                                        try {
                                                            const { ipcRenderer } = (window as any).require('electron');
                                                            await ipcRenderer.invoke('download-and-install-update', updateInfo.downloadUrl);
                                                        } catch (e: any) {
                                                            setUpdateInfo({ error: e.message });
                                                            setUpdateStatus('error');
                                                        }
                                                    }}
                                                    className="w-full py-1 text-[9px] bg-amber-600 hover:bg-amber-500 text-black font-bold rounded transition-colors"
                                                >지금 업데이트</button>
                                            ) : (
                                                <p className="text-[8px] text-slate-600">다운로드 파일이 없습니다. GitHub에서 직접 다운로드하세요.</p>
                                            )}
                                        </div>
                                    )}
                                    {updateStatus === 'downloading' && (
                                        <div className="space-y-1">
                                            <div className="flex justify-between">
                                                <span className="text-[9px] text-slate-400">다운로드 중...</span>
                                                <span className="text-[9px] text-amber-400 font-bold">{downloadProgress}%</span>
                                            </div>
                                            <div className="w-full bg-slate-800 rounded-full h-1.5">
                                                <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${downloadProgress}%` }} />
                                            </div>
                                            <p className="text-[8px] text-slate-600">완료 후 설치 파일이 자동으로 실행됩니다.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* UI Scale Section */}
                            <div className="pt-4 border-t border-slate-800">
                                <div className="flex justify-between items-center mb-2 px-1">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase">UI 크기 조절</span>
                                    <span className="text-[10px] text-amber-500 font-black">{Math.round(uiScale * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="1.0"
                                    max="1.5"
                                    step="0.05"
                                    value={uiScale}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUiScale(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 select-text pointer-events-auto"
                                />
                            </div>

                            {/* Monitor Selection */}
                            <div className="pt-4 border-t border-slate-800">
                                <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">표시 모니터</label>
                                <select
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[11px] text-amber-500 outline-none focus:border-amber-500/50"
                                    onChange={(e) => {
                                        const monitorId = e.target.value;
                                        const monitor = displays.find(d => d.id.toString() === monitorId);
                                        if (monitor) {
                                            setSelectedMonitorId(monitorId);

                                            // 모든 UI 요소를 해당 모니터 중앙으로 이동
                                            const moveUI = (size: { width: number, height: number }) => ({
                                                x: monitor.relativeX + (monitor.bounds.width - size.width * uiScale) / 2,
                                                y: monitor.relativeY + (monitor.bounds.height - size.height * uiScale) / 2
                                            });

                                            setHudPos(moveUI(hudSize));
                                            setEditorPos(moveUI(editorSize));
                                            setRunewordPos(moveUI(runewordSize));
                                            setSettingsPos(moveUI(settingsSize));
                                        }
                                    }}
                                    value={selectedMonitorId || (displays[0]?.id?.toString() || "")}
                                >
                                    {displays.map((d, i) => (
                                        <option key={d.id} value={d.id.toString()}>
                                            모니터 {i + 1} ({d.bounds.width}x{d.bounds.height}) {d.isPrimary ? '[주]' : ''}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[8px] text-slate-600 mt-1 leading-tight">단축키(Ctrl+Shift+M)로도 모니터를 전환할 수 있습니다.</p>
                            </div>

                            {/* Auto-Hide Section */}
                            <div className="pt-4 border-t border-slate-800">
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2">HUD 자동 숨김 (실험실)</h4>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-300">모니터링 활성화</span>
                                        <div
                                            className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${autoHide.enabled ? 'bg-amber-600' : 'bg-slate-700'}`}
                                            onClick={() => setAutoHide((prev: any) => ({ ...prev, enabled: !prev.enabled }))}
                                        >
                                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${autoHide.enabled ? 'left-4.5' : 'left-0.5'}`} />
                                        </div>
                                    </div>

                                    <div className="bg-slate-900/50 p-2 rounded border border-white/5">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] text-slate-400">트리거 픽셀</span>
                                            <div className="flex gap-2 text-[9px] font-mono text-slate-500">
                                                <span>X:{autoHide.x}</span>
                                                <span>Y:{autoHide.y}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-8 h-8 rounded border border-slate-600 shadow-inner"
                                                style={{ backgroundColor: autoHide.targetColor }}
                                                title={autoHide.targetColor}
                                            />
                                            <button
                                                onClick={startCalibration}
                                                disabled={isCalibrating}
                                                className={`flex-1 text-[10px] py-1.5 rounded border border-slate-700 transition-colors ${isCalibrating ? 'bg-amber-900/30 text-amber-500 border-amber-900 animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                                            >
                                                {isCalibrating ? `${countdown}초 후 캡처...` : '트리거 설정 v2'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <div className="flex justify-between items-center mb-1.5 px-1">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase">감지 주기 (ms)</span>
                                            <span className="text-[10px] text-amber-500 font-black">{autoHide.interval}ms</span>
                                        </div>
                                        <input
                                            type="number"
                                            min="100"
                                            max="5000"
                                            step="100"
                                            value={autoHide.interval}
                                            onChange={(e) => setAutoHide(prev => ({ ...prev, interval: parseInt(e.target.value) || 500 }))}
                                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-amber-500 outline-none focus:border-amber-500/50 transition-all font-mono select-text pointer-events-auto"
                                        />
                                        <p className="text-[8px] text-slate-600 mt-1 leading-tight">주기가 짧을수록 반응이 빠르지만 CPU 소모량이 늘어납니다.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            {/* Toast Notification */}
            {toast.show && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900 border border-amber-500/50 text-amber-500 px-6 py-3 rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        <p className="text-[12px] font-black uppercase tracking-wider whitespace-pre-wrap">{toast.message}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
