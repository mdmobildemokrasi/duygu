import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  CheckCircle, 
  XCircle, 
  MinusCircle, 
  MessageCircle, 
  Instagram, 
  Facebook, 
  Loader2,
  AlertCircle,
  History,
  Plus,
  Lock,
  LogOut,
  ChevronRight,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  LayoutList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeDocument, AnalysisResult } from './services/geminiService';
import { db, auth } from './firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, getDocFromServer, doc } from 'firebase/firestore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-white min-h-screen flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Bir Hata Oluştu</h2>
          <p className="text-slate-500 mb-6 max-w-md">Uygulama yüklenirken bir sorunla karşılaşıldı. Lütfen aşağıdaki hata detaylarını kontrol edin.</p>
          <pre className="p-4 bg-slate-100 rounded-xl text-left overflow-auto max-w-full text-xs font-mono text-slate-600 mb-6">
            {this.state.error?.message || JSON.stringify(this.state.error, null, 2)}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-medium shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-colors"
          >
            Sayfayı Yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type Platform = 'whatsapp' | 'instagram' | 'facebook';
type SubCategory = 'yorumlar' | 'dmlar';

interface SavedAnalysis extends AnalysisResult {
  id: string;
  platform: string;
  subCategory?: string;
  fileName: string;
  createdAt: Date;
}

const PLATFORMS: { id: Platform; name: string; icon: React.ElementType; hasSub: boolean }[] = [
  { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, hasSub: false },
  { id: 'instagram', name: 'Instagram', icon: Instagram, hasSub: true },
  { id: 'facebook', name: 'Facebook', icon: Facebook, hasSub: true },
];

const SUB_CATEGORIES: { id: SubCategory; name: string }[] = [
  { id: 'yorumlar', name: 'Yorumlar' },
  { id: 'dmlar', name: "DM'ler" },
];

export default function App() {
  const [isAppUnlocked, setIsAppUnlocked] = useState(() => localStorage.getItem('app_unlocked') === 'true');
  const [appEmail, setAppEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [appLoginError, setAppLoginError] = useState('');

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState<'new' | 'history' | 'stats'>('history');
  const [statsSubTab, setStatsSubTab] = useState<SubCategory>('yorumlar');
  const [pastAnalyses, setPastAnalyses] = useState<SavedAnalysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<SavedAnalysis | null>(null);
  const [selectedSentimentDetails, setSelectedSentimentDetails] = useState<string | null>(null);

  const [activePlatform, setActivePlatform] = useState<Platform>('whatsapp');
  const [activeSubCategory, setActiveSubCategory] = useState<SubCategory>('yorumlar');
  const [statsDateFilter, setStatsDateFilter] = useState<'all' | 'week' | 'month'>('all');
  
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore bağlantısı başarılı.");
      } catch (error: any) {
        if (error.message && error.message.includes('the client is offline')) {
          console.error("Firestore bağlantı hatası: İstemci çevrimdışı. Lütfen Firebase yapılandırmasını kontrol edin.");
        } else {
          console.error("Firestore test hatası:", error);
        }
      }
    }
    testConnection();

    const q = query(
      collection(db, 'analyses'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const analyses: SavedAnalysis[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        analyses.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as SavedAnalysis);
      });
      setPastAnalyses(analyses);
    }, (err) => {
      console.error("Firestore error: ", err);
    });

    return () => unsubscribe();
  }, []);

  const handlePlatformChange = (platformId: Platform) => {
    setActivePlatform(platformId);
    if (platformId === 'whatsapp') {
      setActiveSubCategory('yorumlar'); // Reset or ignore
    }
    resetState();
  };

  const resetState = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const processFile = (selectedFile: File) => {
    setError(null);
    setResult(null);
    
    // Check file type
    const isImage = selectedFile.type.startsWith('image/');
    const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');

    if (!isImage && !isPdf) {
      setError('Lütfen sadece resim (PNG, JPG) veya PDF dosyası yükleyin.');
      return;
    }

    // Check file size (e.g., max 20MB)
    if (selectedFile.size > 20 * 1024 * 1024) {
      setError("Dosya boyutu 20MB'dan küçük olmalıdır.");
      return;
    }

    setFile(selectedFile);

    // Create preview for images
    if (isImage) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null); // PDF preview is more complex, we'll just show an icon
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Dosya dönüştürülemedi.'));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const base64 = await fileToBase64(file);
      const platformName = PLATFORMS.find(p => p.id === activePlatform)?.name || activePlatform;
      const subCategoryName = PLATFORMS.find(p => p.id === activePlatform)?.hasSub 
        ? SUB_CATEGORIES.find(s => s.id === activeSubCategory)?.name 
        : undefined;

      const fileMimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      const analysisResult = await analyzeDocument(base64, fileMimeType, platformName, subCategoryName);
      setResult(analysisResult);

      try {
        await addDoc(collection(db, 'analyses'), {
          platform: platformName,
          subCategory: subCategoryName || null,
          fileName: file.name,
          overallSentiment: analysisResult.overallSentiment,
          summary: analysisResult.summary,
          messages: analysisResult.messages,
          createdAt: serverTimestamp()
        });
      } catch (dbErr) {
        console.error("Veritabanına kaydedilirken hata oluştu:", dbErr);
        // We don't want to fail the whole process if saving fails, just log it.
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Analiz sırasında bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedUsername = loginUsername.toLowerCase().replace(/\s/g, '');
    if (normalizedUsername === 'mutialperen@paydaskent.com' && loginPassword === '12371237') {
      setIsLoggedIn(true);
      setActiveTab('new');
      setLoginError('');
      
      try {
        await addDoc(collection(db, 'logins'), {
          username: normalizedUsername,
          type: 'admin_login',
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Giriş kaydedilemedi:", err);
      }
    } else {
      setLoginError('Geçersiz kullanıcı adı veya şifre.');
    }
  };

  const handleAppLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedInput = appEmail.toLowerCase().replace(/\s/g, '');
    
    // Check for System Login
    if (normalizedInput === 'etimesgut@paydaskent.com' && appPassword === '159753') {
      setIsAppUnlocked(true);
      localStorage.setItem('app_unlocked', 'true');
      setAppLoginError('');
      
      try {
        await addDoc(collection(db, 'logins'), {
          username: normalizedInput,
          type: 'system_unlock',
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Giriş kaydedilemedi:", err);
      }
      return;
    }

    // Check for Manager Login (mutialperen)
    if (normalizedInput === 'mutialperen@paydaskent.com' && appPassword === '12371237') {
      setIsAppUnlocked(true);
      setIsLoggedIn(true);
      setActiveTab('new');
      localStorage.setItem('app_unlocked', 'true');
      setAppLoginError('');
      
      try {
        await addDoc(collection(db, 'logins'), {
          username: normalizedInput,
          type: 'manager_unlock',
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Giriş kaydedilemedi:", err);
      }
      return;
    }

    setAppLoginError('Geçersiz kullanıcı adı veya şifre.');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setActiveTab('history');
    resetState();
  };

  const handleAppLogout = () => {
    setIsAppUnlocked(false);
    setIsLoggedIn(false);
    localStorage.removeItem('app_unlocked');
    resetState();
  };

  const filteredAnalyses = pastAnalyses.filter(analysis => {
    const platformName = PLATFORMS.find(p => p.id === activePlatform)?.name;
    return analysis.platform === platformName;
  });

  // Statistics Calculation
  const getStatsData = () => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Filter analyses based on sub-tab and date
    const filteredForStats = pastAnalyses.filter(analysis => {
      // Date filter
      if (statsDateFilter === 'week' && analysis.createdAt < oneWeekAgo) return false;
      if (statsDateFilter === 'month' && analysis.createdAt < oneMonthAgo) return false;

      // Sub-tab filter
      if (statsSubTab === 'yorumlar') {
        return analysis.subCategory === 'Yorumlar';
      } else {
        // DM'ler includes Instagram/Facebook DMs and all WhatsApp messages
        return analysis.subCategory === "DM'ler" || analysis.platform === 'WhatsApp';
      }
    });

    // Platform distribution based on individual message counts
    const platformMessageCounts = filteredForStats.reduce((acc: any, curr) => {
      acc[curr.platform] = (acc[curr.platform] || 0) + curr.messages.length;
      return acc;
    }, {});

    const platformData = Object.keys(platformMessageCounts).map(name => ({
      name,
      value: platformMessageCounts[name]
    }));

    // Granular sentiment counts from individual messages
    const sentimentCounts = filteredForStats.reduce((acc: any, curr) => {
      curr.messages.forEach(msg => {
        acc[msg.sentiment] = (acc[msg.sentiment] || 0) + 1;
      });
      return acc;
    }, {});

    const sentimentData = [
      { name: 'Olumlu', value: sentimentCounts['Olumlu'] || 0, color: '#10b981' },
      { name: 'Olumsuz', value: sentimentCounts['Olumsuz'] || 0, color: '#ef4444' },
      { name: 'Nötr', value: sentimentCounts['Nötr'] || 0, color: '#6b7280' },
      { name: 'Karışık', value: sentimentCounts['Karışık'] || 0, color: '#f59e0b' },
    ];

    // Category ranking based on individual message counts
    const categoryCounts = filteredForStats.reduce((acc: any, curr) => {
      curr.messages.forEach(msg => {
        const cat = msg.category || 'Genel';
        acc[cat] = (acc[cat] || 0) + 1;
      });
      return acc;
    }, {});

    const categoryRanking = Object.keys(categoryCounts)
      .map(name => ({
        name,
        count: categoryCounts[name]
      }))
      .sort((a, b) => b.count - a.count);

    return { platformData, sentimentData, categoryRanking, filteredForStats };
  };

  const stats = getStatsData();

  const getRecentMessagesBySentiment = (sentiment: string) => {
    const allMessages: any[] = [];
    stats.filteredForStats.forEach(analysis => {
      analysis.messages.forEach(msg => {
        if (msg.sentiment === sentiment) {
          allMessages.push({
            ...msg,
            platform: analysis.platform,
            date: analysis.createdAt
          });
        }
      });
    });
    return allMessages.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);
  };
  const COLORS = ['#059669', '#0284c7', '#7c3aed', '#db2777'];

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'Olumlu': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'Olumsuz': return 'text-red-600 bg-red-50 border-red-200';
      case 'Nötr': return 'text-gray-600 bg-gray-50 border-gray-200';
      case 'Karışık': return 'text-amber-600 bg-amber-50 border-amber-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'Olumlu': return <CheckCircle className="w-6 h-6 text-emerald-600" />;
      case 'Olumsuz': return <XCircle className="w-6 h-6 text-red-600" />;
      case 'Nötr': return <MinusCircle className="w-6 h-6 text-gray-600" />;
      case 'Karışık': return <AlertCircle className="w-6 h-6 text-amber-600" />;
      default: return null;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
        {!isAppUnlocked ? (
        <div className="flex-1 flex items-center justify-center p-4 bg-emerald-600">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-2xl border border-white/20 p-8 w-full max-w-md"
          >
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                <FileText className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Paydaşkent Panel</h2>
              <p className="text-slate-500 mt-2">Lütfen giriş bilgilerinizi girin.</p>
            </div>

            <form onSubmit={handleAppLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Kullanıcı Adı veya E-posta</label>
                <input 
                  type="text" 
                  value={appEmail}
                  onChange={(e) => setAppEmail(e.target.value)}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
                  placeholder="Kullanıcı adınız"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Şifre</label>
                <input 
                  type="password" 
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
                  placeholder="••••••••"
                  required
                />
              </div>
              
              {appLoginError && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-2xl flex items-center gap-3"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {appLoginError}
                </motion.div>
              )}

              <button 
                type="submit"
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]"
              >
                Giriş Yap
              </button>
            </form>
            
            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-400 font-medium">© 2026 Etimesgut Belediyesi • Paydaşkent</p>
            </div>
          </motion.div>
        </div>
      ) : (
        <>
          {/* Header */}
          <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Etimesgut Belediyesi</h1>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Duygu Analiz Paneli</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {isLoggedIn && (
                  <button 
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Yönetici Çıkışı
                  </button>
                )}
                <div className="h-6 w-px bg-slate-200 mx-1" />
                <button 
                  onClick={handleAppLogout}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sistemden Çık
                </button>
              </div>
            </div>
          </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-8">
        
        {/* Sidebar */}
        <div className="w-full md:w-64 shrink-0 space-y-6">
          <div>
            <nav className="space-y-1 mb-6">
              {isLoggedIn && (
                <button
                  onClick={() => setActiveTab('new')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'new' 
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Plus className={`w-5 h-5 ${activeTab === 'new' ? 'text-white' : 'text-slate-400'}`} />
                  Yeni Analiz
                </button>
              )}
              <button
                onClick={() => setActiveTab('history')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'history' 
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <History className={`w-5 h-5 ${activeTab === 'history' ? 'text-white' : 'text-slate-400'}`} />
                Geçmiş Analizler
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'stats' 
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <BarChart3 className={`w-5 h-5 ${activeTab === 'stats' ? 'text-white' : 'text-slate-400'}`} />
                İstatistikler
              </button>
            </nav>

            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Platform Filtresi</h2>
            <nav className="space-y-1">
              {PLATFORMS.map((platform) => {
                const Icon = platform.icon;
                const isActive = activePlatform === platform.id;
                return (
                  <button
                    key={platform.id}
                    onClick={() => handlePlatformChange(platform.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                    {platform.name}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sub Categories (if applicable and in admin mode) */}
          <AnimatePresence mode="wait">
            {isLoggedIn && activeTab === 'new' && PLATFORMS.find(p => p.id === activePlatform)?.hasSub && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Kategori</h2>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  {SUB_CATEGORIES.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => {
                        setActiveSubCategory(sub.id);
                        resetState();
                      }}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                        activeSubCategory === sub.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 max-w-3xl">
          {activeTab === 'stats' ? (
            /* Statistics Dashboard */
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Genel İstatistikler</h2>
                  <p className="text-sm text-slate-500 mt-1">Platformlardan gelen verilerin analitik özeti.</p>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                    {SUB_CATEGORIES.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => setStatsSubTab(sub.id)}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                          statsSubTab === sub.id
                            ? 'bg-white text-emerald-700 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {sub.name}
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
                    {[
                      { id: 'all', name: 'Tümü' },
                      { id: 'week', name: 'Son 1 Hafta' },
                      { id: 'month', name: 'Son 1 Ay' }
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        onClick={() => setStatsDateFilter(filter.id as any)}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                          statsDateFilter === filter.id
                            ? 'bg-white text-emerald-600 shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {filter.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Platform Distribution */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex items-center gap-2 mb-2">
                    <PieChartIcon className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Platform Bazlı Mesaj Dağılımı</h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-6">Toplam mesaj sayısının platformlara göre dağılımı.</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.platformData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {stats.platformData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                          formatter={(value) => [`${value} Mesaj`, 'Sayı']}
                        />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Sentiment Distribution */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Duygu Dağılımı ({statsSubTab === 'yorumlar' ? 'Yorumlar' : 'DM'})</h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-6">Grafiğe tıklayarak ilgili mesajları görebilirsiniz.</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={stats.sentimentData}
                        onClick={(data) => {
                          if (data && data.activeLabel) {
                            setSelectedSentimentDetails(String(data.activeLabel));
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                        <Tooltip 
                          cursor={{fill: '#f8fafc', cursor: 'pointer'}}
                          contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }}>
                          {stats.sentimentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Category Ranking */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 md:col-span-2">
                  <div className="flex items-center gap-2 mb-6">
                    <LayoutList className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Hizmet Alanına Göre Dağılım Sıralaması</h3>
                  </div>
                  <div className="space-y-4">
                    {stats.categoryRanking.map((item, index) => {
                      const maxCount = stats.categoryRanking[0].count;
                      const percentage = (item.count / maxCount) * 100;
                      
                      return (
                        <div key={index} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded text-xs font-bold text-slate-500">
                                {index + 1}
                              </span>
                              <span className="font-medium text-slate-700">{item.name}</span>
                            </div>
                            <span className="font-bold text-slate-900">{item.count} Mesaj</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className="h-full bg-emerald-500 rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                    {stats.categoryRanking.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-slate-400">Henüz kategori verisi bulunmuyor.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'new' && !isLoggedIn ? (
            /* Login View */
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md mx-auto mt-12">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Yönetici Girişi</h2>
                <p className="text-slate-500 mt-2">Analiz yapmak için lütfen giriş yapın.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kullanıcı Adı</label>
                  <input 
                    type="text" 
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    placeholder="Kullanıcı adınız"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Şifre</label>
                  <input 
                    type="password" 
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
                
                {loginError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">
                    {loginError}
                  </div>
                )}

                <button 
                  type="submit"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-sm transition-colors"
                >
                  Giriş Yap
                </button>
              </form>
            </div>
          ) : activeTab === 'new' && isLoggedIn ? (
            /* Admin Upload View */
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">
                  {PLATFORMS.find(p => p.id === activePlatform)?.name} Analizi
                  {PLATFORMS.find(p => p.id === activePlatform)?.hasSub && (
                    <span className="text-slate-400 font-normal"> / {SUB_CATEGORIES.find(s => s.id === activeSubCategory)?.name}</span>
                  )}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Vatandaş mesajını içeren ekran görüntüsünü veya PDF dosyasını yükleyin.
                </p>
              </div>

              <div className="p-6">
                {/* Upload Zone */}
                {!file ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf,application/pdf"
                      onChange={handleFileChange}
                    />
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-8 h-8 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                    </div>
                    <p className="text-base font-medium text-slate-700 mb-1">
                      Dosya seçmek için tıklayın veya sürükleyin
                    </p>
                    <p className="text-sm text-slate-500">
                      PNG, JPG veya PDF (Maks. 20MB)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* File Preview */}
                    <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="w-16 h-16 shrink-0 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden">
                        {previewUrl ? (
                          <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <FileText className="w-8 h-8 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button
                        onClick={resetState}
                        disabled={isAnalyzing}
                        className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                      >
                        Kaldır
                      </button>
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <p className="text-sm">{error}</p>
                      </div>
                    )}

                    {/* Action Button */}
                    {!result && !error && (
                      <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-medium shadow-sm transition-colors flex items-center justify-center gap-2"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Analiz Ediliyor...
                          </>
                        ) : (
                          'Duygu Analizi Yap'
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Result Area */}
                <AnimatePresence>
                  {result && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-8 space-y-6"
                    >
                      <div className="h-px bg-slate-200 w-full" />
                      
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-4">Genel Analiz Sonucu</h3>
                        
                        <div className="grid gap-6">
                          {/* Overall Sentiment Badge */}
                          <div className={`flex items-center gap-3 p-4 rounded-xl border ${getSentimentColor(result.overallSentiment)}`}>
                            {getSentimentIcon(result.overallSentiment)}
                            <div>
                              <p className="text-sm font-bold uppercase tracking-wide">Genel Duygu Durumu</p>
                              <p className="text-lg font-medium">{result.overallSentiment}</p>
                            </div>
                          </div>

                          {/* Summary */}
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Genel Özet</p>
                            <p className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
                              {result.summary}
                            </p>
                          </div>

                          {/* Individual Messages */}
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Çıkarılan Mesajlar ({result.messages.length})</p>
                            <div className="space-y-4">
                              {result.messages.map((msg, index) => (
                                <div key={index} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                  <div className="flex items-start justify-between gap-4 mb-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                        <span className="text-xs font-medium text-slate-600">
                                          {msg.username ? msg.username.substring(0, 2).toUpperCase() : 'A'}
                                        </span>
                                      </div>
                                      <span className="text-sm font-semibold text-slate-900">
                                        {msg.username || 'Anonim Kullanıcı'}
                                      </span>
                                    </div>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getSentimentColor(msg.sentiment)}`}>
                                      {getSentimentIcon(msg.sentiment)}
                                      <span className="ml-1">{msg.sentiment}</span>
                                    </span>
                                  </div>
                                  
                                  <div className="text-sm text-slate-800 font-mono whitespace-pre-wrap mb-3 pl-10">
                                    {msg.extractedText}
                                  </div>
                                  
                                  <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg ml-10 border border-slate-100">
                                    <span className="font-semibold text-slate-600">Neden: </span>
                                    {msg.explanation}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={resetState}
                        className="w-full py-3 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-medium shadow-sm transition-colors"
                      >
                        Yeni Dosya Yükle
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            /* Public History View */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {PLATFORMS.find(p => p.id === activePlatform)?.name} Arşivi
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">Bu platformdan gelen geçmiş analizler listeleniyor.</p>
                </div>
                <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  {filteredAnalyses.length} Kayıt
                </div>
              </div>

              {filteredAnalyses.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                  <History className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">Bu platform için henüz kayıtlı bir analiz bulunmuyor.</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredAnalyses.map((analysis) => (
                    <div 
                      key={analysis.id} 
                      onClick={() => setSelectedAnalysis(analysis)}
                      className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-slate-900">{analysis.platform}</span>
                            {analysis.subCategory && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-sm text-slate-500">{analysis.subCategory}</span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            {analysis.createdAt.toLocaleString('tr-TR')} • {analysis.fileName}
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getSentimentColor(analysis.overallSentiment)}`}>
                          {getSentimentIcon(analysis.overallSentiment)}
                          <span className="ml-1">{analysis.overallSentiment}</span>
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4 line-clamp-2">
                        {analysis.summary}
                      </p>
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span>{analysis.messages.length} mesaj analiz edildi</span>
                        <span className="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          Detayları Gör <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Analysis Details Modal */}
      <AnimatePresence>
        {selectedAnalysis && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAnalysis(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative z-10"
            >
              <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-slate-900">Analiz Detayları</h2>
                    <span className="text-slate-300">•</span>
                    <span className="text-sm font-medium text-slate-600">{selectedAnalysis.platform}</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {selectedAnalysis.fileName} • {selectedAnalysis.createdAt.toLocaleString('tr-TR')}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedAnalysis(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-5 sm:p-6 overflow-y-auto flex-1 bg-slate-50/50">
                <div className="grid gap-6">
                  {/* Overall Sentiment Badge */}
                  <div className={`flex items-center gap-3 p-4 rounded-xl border bg-white shadow-sm ${getSentimentColor(selectedAnalysis.overallSentiment)}`}>
                    {getSentimentIcon(selectedAnalysis.overallSentiment)}
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wide">Genel Duygu Durumu</p>
                      <p className="text-lg font-medium">{selectedAnalysis.overallSentiment}</p>
                    </div>
                  </div>

                  {/* Summary */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Genel Özet</p>
                    <p className="text-sm text-slate-700 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      {selectedAnalysis.summary}
                    </p>
                  </div>

                  {/* Individual Messages */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Çıkarılan Mesajlar ({selectedAnalysis.messages.length})
                    </p>
                    <div className="space-y-4">
                      {selectedAnalysis.messages.map((msg, index) => (
                        <div key={index} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                <span className="text-xs font-medium text-slate-600">
                                  {msg.username ? msg.username.substring(0, 2).toUpperCase() : 'A'}
                                </span>
                              </div>
                              <span className="text-sm font-semibold text-slate-900">
                                {msg.username || 'Anonim Kullanıcı'}
                              </span>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getSentimentColor(msg.sentiment)}`}>
                              {getSentimentIcon(msg.sentiment)}
                              <span className="ml-1">{msg.sentiment}</span>
                            </span>
                          </div>
                          
                          <div className="text-sm text-slate-800 font-mono whitespace-pre-wrap mb-3 pl-10">
                            {msg.extractedText}
                          </div>
                          
                          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg ml-10 border border-slate-100">
                            <span className="font-semibold text-slate-600">Neden: </span>
                            {msg.explanation}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sentiment Details Modal */}
      <AnimatePresence>
        {selectedSentimentDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSentimentDetails(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden relative z-10"
            >
              <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${getSentimentColor(selectedSentimentDetails)}`}>
                    {getSentimentIcon(selectedSentimentDetails)}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Son {selectedSentimentDetails} Mesajlar</h2>
                    <p className="text-sm text-slate-500">Bu duygu durumuna sahip son 10 yorum listeleniyor.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedSentimentDetails(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-5 sm:p-6 overflow-y-auto flex-1 bg-slate-50/50">
                <div className="space-y-4">
                  {getRecentMessagesBySentiment(selectedSentimentDetails).map((msg, index) => (
                    <div key={index} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{msg.platform}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-xs text-slate-500">{msg.date.toLocaleDateString('tr-TR')}</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{msg.username || 'Anonim'}</span>
                      </div>
                      <p className="text-sm text-slate-800 font-mono mb-2">{msg.extractedText}</p>
                      <div className="text-xs text-slate-500 italic">
                        <span className="font-semibold not-italic text-slate-600">Neden: </span>
                        {msg.explanation}
                      </div>
                    </div>
                  ))}
                  {getRecentMessagesBySentiment(selectedSentimentDetails).length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-slate-400">Bu kategoride henüz mesaj bulunmuyor.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
    </ErrorBoundary>
  );
}
