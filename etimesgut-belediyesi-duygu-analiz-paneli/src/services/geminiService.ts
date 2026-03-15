import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface MessageAnalysis {
  username?: string;
  extractedText: string;
  sentiment: 'Olumlu' | 'Olumsuz' | 'Nötr';
  category: string;
  explanation: string;
}

export interface AnalysisResult {
  overallSentiment: 'Olumlu' | 'Olumsuz' | 'Nötr' | 'Karışık';
  summary: string;
  messages: MessageAnalysis[];
}

export async function analyzeDocument(
  fileBase64: string,
  mimeType: string,
  platform: string,
  subCategory?: string
): Promise<AnalysisResult> {
  const platformContext = subCategory ? `${platform} - ${subCategory}` : platform;
  
  const prompt = `Sen Etimesgut Belediyesi için çalışan uzman bir asistan ve veri analistisin. 
Gönderilen dosya (${platformContext} üzerinden gelmiş) vatandaşların mesajlarını veya yorumlarını içeriyor. 
Lütfen dosyadaki tüm metinleri (kullanıcı adları ve mesajları) OCR ile dikkatlice çıkar.
Görselde birden fazla yorum/mesaj olabilir. Her bir mesajı ayrı ayrı analiz et.
Her bir mesaj için:
1. Varsa kullanıcı adını çıkar.
2. Mesajın tam metnini çıkar.
3. Mesajın duygu analizini yap ("Olumlu", "Olumsuz" veya "Nötr").
4. Mesajın hangi belediye hizmet alanı ile ilgili olduğunu AŞAĞIDAKİ STANDART LİSTEDEN seçerek belirle. Kesinlikle bu listedeki isimleri kullan, yeni kategori üretme:
   - "Ulaşım" (Otobüs, durak, trafik vb.)
   - "Temizlik" (Çöp toplama, sokak temizliği vb.)
   - "Park ve Bahçeler" (Parklar, ağaçlandırma, yeşil alanlar vb.)
   - "Fen İşleri" (Yol yapımı, kaldırım, asfalt, altyapı vb.)
   - "Sosyal Yardım" (Gıda yardımı, destek kartları, nakdi yardım vb.)
   - "Kültür ve Sanat" (Etkinlikler, kurslar, konserler vb.)
   - "Sokak Hayvanları" (Barınak, besleme, veteriner hizmetleri vb.)
   - "Zabıta ve Denetim" (Pazar yerleri, işyeri denetimi, gürültü vb.)
   - "İmar ve Şehircilik" (Ruhsat, yapı kontrol, planlama vb.)
   - "Genel" (Yukarıdakilere girmeyen genel teşekkür veya şikayetler)
5. Neden bu duyguya karar verdiğini kısaca açıkla.

Son olarak, tüm mesajları değerlendirerek genel bir özet ve genel duygu durumu ("Olumlu", "Olumsuz", "Nötr" veya "Karışık") belirle.
Sonucu aşağıdaki JSON şemasına uygun olarak döndür.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallSentiment: {
            type: Type.STRING,
            description: 'Tüm mesajların genel duygu durumu',
            enum: ['Olumlu', 'Olumsuz', 'Nötr', 'Karışık'],
          },
          summary: {
            type: Type.STRING,
            description: 'Tüm mesajların genel bir özeti ve değerlendirmesi',
          },
          messages: {
            type: Type.ARRAY,
            description: 'Görseldeki her bir mesajın ayrı ayrı analizi',
            items: {
              type: Type.OBJECT,
              properties: {
                username: {
                  type: Type.STRING,
                  description: 'Mesajı yazan kullanıcının adı (varsa)',
                },
                extractedText: {
                  type: Type.STRING,
                  description: 'Kullanıcının yazdığı mesajın tam metni',
                },
                sentiment: {
                  type: Type.STRING,
                  description: 'Bu spesifik mesajın duygu analizi sonucu',
                  enum: ['Olumlu', 'Olumsuz', 'Nötr'],
                },
                category: {
                  type: Type.STRING,
                  description: 'Mesajın ilgili olduğu belediye hizmet alanı (örneğin: Ulaşım, Temizlik, Sosyal Yardım)',
                },
                explanation: {
                  type: Type.STRING,
                  description: 'Bu mesaja neden bu duygunun verildiğinin kısa açıklaması',
                },
              },
              required: ['extractedText', 'sentiment', 'category', 'explanation'],
            },
          },
        },
        required: ['overallSentiment', 'summary', 'messages'],
      },
    },
  });

  if (!response.text) {
    throw new Error('API yanıt döndürmedi.');
  }

  return JSON.parse(response.text) as AnalysisResult;
}
