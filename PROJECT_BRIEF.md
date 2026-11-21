# Mini RAG -- Document Assistant

## Junior Full-Stack Developer Project Brief

**Amaç:** React + TypeScript ve Node.js + Express kullanarak
kullanıcıların PDF dokümanları yükleyebildiği ve bu dokümanlara doğal
dilde sorular sorabildiği, uçtan uca çalışan küçük bir AI uygulaması
geliştirmek.

Bu proje bir junior seviyesinde tamamlanabilir olmalı. Öncelik karmaşık
altyapılar kurmak değil; Node.js/Express ile API geliştirme, veritabanı
kullanımı, temel authentication, React entegrasyonu ve RAG mantığını
doğru şekilde uygulamaktır.

------------------------------------------------------------------------

## 1. Ürün kapsamı

Uygulamanın temel kullanıcı akışı:

1.  Kullanıcı kayıt olur ve giriş yapar.
2.  PDF dokümanı yükler.
3.  Backend PDF içerisindeki metni çıkarır.
4.  Metin küçük parçalara (chunks) bölünür.
5.  Her parça için embedding oluşturulur.
6.  Chunk metinleri, embedding'ler ve doküman bilgileri veritabanında
    saklanır.
7.  Kullanıcı dokümanları hakkında soru sorar.
8.  Sistem soruyla ilişkili chunk'ları bulur ve LLM'e bağlam (context)
    olarak gönderir.
9.  LLM cevabı ve kullanılan kaynak parçaları frontend'de gösterilir.

**Örnek:** Kullanıcı bir teknik doküman yükler ve "Uygulamada kullanıcı
doğrulaması nasıl yapılıyor?" diye sorar. Sistem yalnızca yüklenen
dokümanlardan bulduğu ilgili içeriklere dayanarak cevap verir ve cevabın
hangi dokümandan geldiğini gösterir.

## 2. Önerilen teknoloji stack'i

  -----------------------------------------------------------------------
  Katman                  Teknoloji               Kullanım
  ----------------------- ----------------------- -----------------------
  Frontend                React + TypeScript +    Kullanıcı arayüzü
                          Vite                    

  Backend                 Node.js + Express +     REST API
                          TypeScript              

  Authentication          Supabase Auth           Kayıt, giriş ve token
                                                  doğrulama

  Database                Supabase PostgreSQL +   Kullanıcı, doküman,
                          pgvector                chunk ve embedding
                                                  verileri

  AI orchestration        LangChain.js            Document loading,
                                                  splitting, embedding ve
                                                  retrieval

  LLM                     OpenAI API veya Gemini  Cevap üretimi
                          API                     

  Embedding               Sağlayıcının embedding  Metni vektörlere
                          modeli                  dönüştürme

  Deployment              GitHub + Vercel +       Kaynak kodu, frontend
                          Render                  ve backend yayını

  Local development       Docker Compose          Yerel geliştirme ortamı
                          (tercihen)              
  -----------------------------------------------------------------------

### Neden Supabase Auth?

Bu proje için ilk tercih **Supabase Auth**. Ücretsiz başlangıç seçeneği
sunar ve Supabase PostgreSQL ile aynı ekosistemde çalışır. Böylece ayrı
bir Auth0 kurulumu ve kullanıcı yönetimi altyapısı öğrenmek zorunda
kalmadan JWT tabanlı kimlik doğrulamayı uygulayabilirsin.

Alternatif olarak Auth0 da kullanılabilir. Ancak aynı projede iki
authentication sağlayıcısını birden kullanma; birini seç.

**Güvenlik notu:** Frontend'den gelen kullanıcı ID'sine güvenme.
Backend, Supabase access token'ını doğrulamalı ve her doküman sorgusunda
kaydın ilgili kullanıcıya ait olduğunu kontrol etmeli. Service-role key
yalnızca backend ortam değişkenlerinde tutulmalı; frontend'e kesinlikle
gönderilmemeli.

## 3. Mimari ve veri akışları

### 3.1. Ingestion pipeline -- Doküman yükleme

``` text
React UI
   |
   | POST /api/documents
   v
Node.js + Express API
   |
   v
PDF text extraction
   |
   v
Text splitting / chunking
   |
   v
Embedding generation
   |
   v
PostgreSQL + pgvector
   |
   v
Document status = completed
```

MVP'de ingestion işlemi API isteği sırasında senkron çalışabilir. Büyük
dosyalarda HTTP timeout ve uzun süren işlemler sorun yaratabileceği için
dosya boyutuna sınır koy. İlk sürümde Redis, BullMQ veya ayrı worker
zorunlu değil. Bunlar ancak temel akış çalıştıktan sonra ek geliştirme
olarak düşünülebilir.

### 3.2. Query pipeline -- Soru-cevap

``` text
User question
   |
   v
Generate query embedding
   |
   v
pgvector similarity search
   |
   v
Retrieve relevant chunks
   |
   v
Build prompt with retrieved context
   |
   v
LLM answer generation
   |
   v
Answer + source references
```

Modelin cevabı yüklenen dokümanlarda yeterli bilgi bulamadığında bunu
açıkça söylemesini sağla. Kaynak olarak kullanılan chunk'ları cevapla
birlikte döndür.

## 4. MVP özellikleri

### Authentication

-   [ ] Supabase Auth ile kayıt ve giriş.
-   [ ] Çıkış yapma.
-   [ ] Backend'de access token doğrulama middleware'i.
-   [ ] Her kullanıcının yalnızca kendi dokümanlarına erişebilmesi.

### Document management

-   [ ] PDF yükleme.
-   [ ] Kullanıcının dokümanlarını listeleme.
-   [ ] Doküman detayını ve işlenme durumunu gösterme.
-   [ ] Doküman silme.
-   [ ] Dosya türü ve boyutu doğrulama.

### Ingestion

-   [ ] PDF'den metin çıkarma.
-   [ ] Metni chunk'lara bölme.
-   [ ] Chunk'lar için embedding üretme.
-   [ ] Chunk, embedding ve metadata bilgilerini PostgreSQL/pgvector'a
    kaydetme.
-   [ ] Hata durumunda doküman durumunu `failed` olarak güncelleme.

### RAG chat

-   [ ] Kullanıcıdan soru alma.
-   [ ] Soru embedding'i üretme.
-   [ ] Benzer chunk'ları pgvector ile bulma.
-   [ ] Bulunan içerikleri LLM prompt'una ekleme.
-   [ ] Cevabı ve kaynak doküman/chunk bilgilerini döndürme.
-   [ ] İlgili içerik bulunamadığında bunu kullanıcıya belirtme.

### Frontend

-   [ ] Login / Register ekranı.
-   [ ] Doküman listeleme ve yükleme ekranı.
-   [ ] Chat ekranı.
-   [ ] Loading, empty ve error state'leri.
-   [ ] Cevapların altında kaynak gösterimi.

## 5. Önerilen API taslağı

  Method   Endpoint               Açıklama
  -------- ---------------------- -------------------------------------
  POST     `/api/documents`       PDF yükle ve ingestion başlat
  GET      `/api/documents`       Kullanıcının dokümanlarını listele
  GET      `/api/documents/:id`   Doküman detayını getir
  DELETE   `/api/documents/:id`   Dokümanı ve ilişkili chunk'ları sil
  POST     `/api/chat`            Dokümanlar üzerinden soru sor

Tüm endpoint'ler authentication gerektirmeli. Her endpoint'te kullanıcı
sahipliği kontrolü yapılmalı.

## 6. Basit veri modeli

### documents

-   `id`
-   `user_id`
-   `filename`
-   `status` (`processing`, `completed`, `failed`)
-   `created_at`

### document_chunks

-   `id`
-   `document_id`
-   `user_id`
-   `content`
-   `embedding` (pgvector)
-   `chunk_index`
-   `metadata` (JSONB)

İhtiyaç olursa sohbet geçmişi için `conversations` ve `messages`
tabloları eklenebilir; MVP için zorunlu değildir.

## 7. Deployment ve GitHub

Projeyi GitHub üzerinde public bir repository olarak tut. Repository'de
kurulum adımları, environment variable listesi, mimari açıklama ve ekran
görüntüleri bulunan anlaşılır bir README olmalı.

Önerilen yayınlama:

-   **Frontend:** Vercel üzerinde yayınla.
-   **Backend:** Render üzerinde Node.js/Express servisi olarak yayınla.
-   **Database + Auth:** Supabase projesi kullan.
-   **CI:** GitHub Actions ile en azından lint, typecheck ve test
    komutlarını pull request veya push sırasında çalıştır.

Vercel frontend ve Render backend için ayrı deployment kullanmak, junior
proje kapsamında anlaşılır ve yönetilebilir bir yaklaşımdır. Backend'i
Vercel'e taşımak zorunlu değildir.

### Environment variables

Örnek değişken isimleri:

``` env
# Frontend
VITE_API_BASE_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Backend
PORT=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
# veya seçilen LLM sağlayıcısının API anahtarı
```

Gerçek secret değerlerini GitHub'a commit etme. `.env.example`
dosyasında yalnızca boş örnekler bulundur. Supabase service-role key ve
LLM API key sadece backend ortamında bulunmalı.

## 8. Test ve kalite beklentileri

-   [ ] En azından temel API integration testleri yaz.
-   [ ] Authentication olmadan korumalı endpoint'lere erişilemediğini
    test et.
-   [ ] Bir kullanıcının başka kullanıcının dokümanına erişemediğini
    test et.
-   [ ] PDF yükleme ve hatalı dosya senaryolarını test et.
-   [ ] Retrieval işleminin beklenen doküman parçalarını döndürdüğünü
    test et.
-   [ ] Lint ve TypeScript typecheck komutlarını ekle.

Her şeyi test etmek gerekmiyor. Öncelik authentication, doküman
sahipliği ve temel RAG akışının doğru çalışması.

## 9. Önerilen çalışma planı

Günde yaklaşık 2--3 saat ayırarak 7--10 günlük bir hedef:

  Aşama                     Tahmini süre Çıktı
  ----------------------- -------------- ---------------------------------------
  1\. Proje kurulumu               1 gün React, Express, TypeScript ve GitHub
  2\. Auth + database              1 gün Supabase Auth ve temel tablolar
  3\. Document API                 1 gün PDF upload, listeleme ve silme
  4\. Ingestion                 1--2 gün Extraction, chunking ve embedding
  5\. RAG API                   1--2 gün Retrieval ve LLM cevapları
  6\. Frontend                  1--2 gün Upload, listeleme ve chat ekranı
  7\. Test + deployment            1 gün Testler, GitHub Actions ve canlı demo

Bu süre bir hedef, kesin teslim tarihi değil. Öncelik özellikleri
gerçekten anlamak ve çalışan bir MVP çıkarmak.

## 10. İsteğe bağlı geliştirmeler

MVP tamamlandıktan sonra zaman kalırsa:

1.  **LangGraph.js:** `Retrieve → Evaluate Relevance → Generate Answer`
    akışını graph olarak kur.
2.  **Async ingestion:** Redis + BullMQ ile doküman işleme işlerini
    background worker'a taşı.
3.  **Evaluation:** Küçük bir soru-cevap veri setiyle retrieval
    kalitesini ölç.
4.  **Chat history:** Sohbet geçmişini sakla.
5.  **Improved retrieval:** Metadata filtering veya hybrid search ekle.

Bunların hiçbiri ilk çalışan sürüm için zorunlu değil.

## 11. Tamamlanma kriterleri

Proje tamamlandı sayılabilmesi için:

-   Canlı frontend ve backend adresleri çalışıyor olmalı.
-   Kullanıcı kayıt olup giriş yapabilmeli.
-   PDF yükleyip işlenme durumunu görebilmeli.
-   Yüklediği dokümanlar hakkında soru sorabilmeli.
-   Cevaplarda kaynak doküman veya ilgili metin parçaları gösterilmeli.
-   Kullanıcı başka bir kullanıcının dokümanlarına erişememeli.
-   GitHub README dosyasında mimari, kurulum ve deployment bilgileri
    bulunmalı.
-   Aday geliştirdiği mimariyi ve RAG akışını kendi cümleleriyle
    açıklayabilmeli.

------------------------------------------------------------------------

## Son not

Bu proje bir tutorial kopyalama çalışması değil. Hazır örneklerden
yararlanabilirsin ancak yazdığın kodun ne yaptığını, neden o teknolojiyi
seçtiğini ve hata durumunda sistemin nasıl davrandığını
açıklayabilmelisin.

**Öğrenme önceliği:** Node.js + Express + TypeScript → PostgreSQL →
LangChain ve RAG → React entegrasyonu → Deployment.

İlk hedef küçük, güvenli ve çalışan bir ürün çıkarmak. İleri seviye
mimariyi ihtiyaç doğdukça ekle.
