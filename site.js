/* ===== gemeenschappelijke onderdelen: kop, voet en winkelmandje staan op elke pagina ===== */
(function(){
  var page=document.body.dataset.page||'home';
  var nav=function(h,k,txt,id){return '<a href="'+h+'"'+(id===page?' class="cur" aria-current="page"':'')+' data-t="'+k+'">'+txt+'</a>'};
  var head='<a class="skip" href="#top" data-t="skip">Naar de inhoud</a><div class="announce"><span data-t="f_pay">Afhalen en bezorgen in Gorinchem en omgeving</span></div>'
  +'<header class="top"><div class="wrap">'
  +'<a class="brand" href="index.html" aria-label="Bassma Lunchroom"><img src="images/logo-face.png" alt=""><span><b>BASSMA</b><small>LUNCHROOM</small></span></a>'
  +'<nav class="main" id="mainnav">'+nav('index.html','n_home','Home','home')+nav('menu.html','n_menu','Menu','menu')+nav('contact.html','n_contact','Contact','contact')+'</nav>'
  +'<div class="hright"><div class="langs" role="group" aria-label="Taal" id="langs1"></div><div class="lp" id="lp"><button id="lpb" aria-haspopup="true" aria-expanded="false" aria-label="Taal"></button><div class="lpm" id="lpm"></div></div>'
  +'<button class="cartbtn" id="openCart" aria-label="Winkelmandje"><svg class="bag" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1 13H5z"/><path d="M9 7a3 3 0 016 0"/></svg><span data-t="cart_btn">Bestelling</span><span class="n" id="cnt">0</span></button>'
  +'<button class="burger" id="burger" aria-label="Menu" aria-expanded="false"><i></i><i></i><i></i></button></div>'
  +'</div></header>';
  var foot='<footer><div class="wrap fgrid">'
  +'<div class="fbrand"><b>BASSMA</b><small>LUNCHROOM</small><p data-t="f_pay">Afhalen en bezorgen in Gorinchem en omgeving</p></div>'
  +'<nav class="flinks" aria-label="Snel naar"><h4 data-t="foot_nav">Snel naar</h4><a href="index.html" data-t="n_home">Home</a><a href="menu.html" data-t="n_menu">Menu</a><a href="contact.html" data-t="n_contact">Contact</a><a href="privacy.html" data-t="privacy_l">Privacy</a><a href="https://www.thuisbezorgd.nl/menu/broodjeszaak-bassma" target="_blank" rel="noopener">Thuisbezorgd</a></nav>'
  +'<div class="fcontact"><h4 data-t="i_h2">Adres</h4><p>Koningin Wilhelminalaan 34<br>4205 EX Gorinchem<br><a href="tel:0183785769">0183 785 769</a></p></div>'
  +'</div><div class="wrap fbase"><span>© 2026 Bassma Lunchroom · Gorinchem</span><a href="https://muldex.nl" target="_blank" rel="noopener">Website door Muldex</a></div></footer>'
  +'<button class="mbar" id="mbar" aria-label="Bekijk bestelling"><span><span class="n" id="mcnt">0</span><span data-t="view_order">Bekijk bestelling</span></span><span id="mtot"></span></button>'
  +'<div class="ov" id="ov"></div>'
  +'<aside id="cart" aria-hidden="true" role="dialog" aria-label="Winkelmandje"><div class="ch"><h2 id="ctitle">Jouw bestelling</h2><button class="x" id="closeCart" aria-label="Sluiten">×</button></div><div id="cview" style="display:flex;flex-direction:column;flex:1;min-height:0"></div></aside>'
  +'<div class="toast" id="toast" role="status"></div>';
  document.body.insertAdjacentHTML('afterbegin',head);
  document.body.insertAdjacentHTML('beforeend',foot);
  var bg=document.getElementById('burger'),mn=document.getElementById('mainnav');
  bg.onclick=function(){var o=mn.classList.toggle('open');bg.setAttribute('aria-expanded',o)};
})();
/* ===== instellingen: pas hier aan ===== */
var CFG={
  HOURS:{0:[12,0,20,0],1:[10,0,22,0],2:[10,0,22,0],3:[10,0,22,0],4:[10,0,22,0],5:[10,0,22,0],6:[10,0,22,0]}, /* 0=zondag ... 6=zaterdag, uit Google Maps. Met de server komt dit uit het beheerpaneel. */
  EXC:{},
  SHOP:{lat:51.8404394,lon:4.9680569,name:'Bassma Lunchroom',address:'Koningin Wilhelminalaan 34, 4205 EX Gorinchem',phone:'0183 785 769'},
  DELIVERY:{enabled:true,city:'Gorinchem',freeFrom:60,zones:[{name:'Tot 17,5 km',maxKm:17.5,fee:2}]},
  ETA:{prepMin:5,prepMax:10,minPerKm:1}, /* gerecht 5-10 minuten, plus 1 minuut per km bezorgen */
  MIN_ORDER:0,
  CASH:true,
  DAYS:6,
  PAY:null
};

/* ===== menu (prijzen van de bestaande website; sucuk-omelet losse prijs controleren) ===== */
/* menu: zie menu-data.js */

/* ===== vertalingen van de interface (productnamen blijven Nederlands) ===== */
var T={
nl:{n_menu:'Menu',n_info:'Openingstijden',n_contact:'Contact',cart_btn:'Bestelling',eyebrow:'Lunchroom in Gorinchem',h1a:'Vers belegd,',h1b:'thuisbezorgd of om af te halen.',lead:'Broodjes, wraps, schotels, kapsalons en meer. Bereid met verse ingrediënten en de warmte van de Oosterse keuken.',order_now:'Bestel nu',hours:'Openingstijden',f1:'Dagvers bereid',f2:'Afhalen of bezorgen',f3:'Volg je bestelling live',shop_h:'Bestel online',search_l:'Zoek in het menu',search_ph:'Zoek een gerecht',i_h1:'Openingstijden',i_h2:'Adres',i_h3:'Bestellen',i_p3:'Bestel hier direct online, of kies bezorging via Thuisbezorgd.',route:'Route in Google Maps',f_pay:'Afhalen en bezorgen in Gorinchem en omgeving',view_order:'Bekijk bestelling',open:'Nu geopend · tot {t}',closed1:'Gesloten · vandaag open vanaf {t}',closed2:'Gesloten · morgen weer open vanaf {t}',hours_txt:'Elke dag van {a} tot {b}',menu_hint:'Menu = met friet en een drankje',loose:'Los',menu:'Menu',add:'Toevoegen',added:'Toegevoegd',none:'Geen resultaten',your:'Jouw bestelling',empty:'Je bestelling is nog leeg.',sub:'Subtotaal',total:'Totaal',checkout:'Afrekenen',back:'Terug',pickup:'Afhalen',delivery:'Bezorgen',name:'Naam',phone:'Telefoon',email:'E-mailadres',street:'Straat en huisnummer',postcode:'Postcode',city:'Plaats',time:'Tijdstip',asap:'Zo snel mogelijk',note:'Opmerking (optioneel)',paywith:'Betaal met',pay:'Betalen',cash:'Contant bij afhalen',remove:'Verwijderen',req:'Vul dit veld in',min:'Minimaal bestelbedrag is {m}',thanks:'Bedankt voor je bestelling!',order:'Bestelnummer',show_e:'Uitgelicht',show_h:'Onze favorieten',soon:'Foto volgt',eta_pick:'Klaar om af te halen over ca. {a}–{b} minuten',eta_del:'Verwachte bezorging over ca. {a}–{b} minuten',fee_city:'Bezorgkosten',fee_out:'Bezorgkosten ({km} km)',fee_free:'Gratis bezorging',calc:'Bezorgkosten berekenen…',fill_addr:'Vul je adres in om de bezorgkosten te zien.',q_noaddr:'Adres niet gevonden. Controleer straat, postcode en plaats.',q_far:'Dit adres ligt buiten ons bezorggebied (maximaal {m} km).',q_net:'Bezorgkosten konden niet worden berekend. Probeer het opnieuw.',freehint:'Nog {x} tot gratis bezorging',mail_sent:'We sturen een bevestiging naar {e}.',info_del:'Bezorgen: € 2 (tot 17,5 km), gratis vanaf € 60.',track:'Volg je bestelling en zie wanneer het komt',privacy_l:'Privacy',date:'Datum',today:'Vandaag',tomorrow:'Morgen',closed_day:'gesloten',full:'vol',slot_none:'Geen tijden beschikbaar op deze dag. Kies een andere dag.',slot_chosen:'Gekozen tijdstip: {s}',privacy:'We gebruiken je gegevens alleen voor deze bestelling.',pay_off:'Online betalen is nog niet beschikbaar.',delivery_off:'Bezorgen is op dit moment niet mogelijk.',info_del2:'Bezorgen: € {fee} (tot {km} km), gratis vanaf € {free}.',hw:'Maandag t/m zaterdag',hs:'Zondag',noslot:'Nu gesloten. Bestel weer binnen de openingstijden.',demo:'Dit is een voorbeeldwebsite: er is nog geen echte betaling gedaan en de bestelling is nog niet doorgestuurd.',close:'Sluiten',fee:'Bezorgkosten',redir:'Je gaat naar de betaalpagina…',fail:'Betaling starten mislukt. Probeer het opnieuw.',dnote:'Bezorging: je betaalt online.'},
en:{n_menu:'Menu',n_info:'Opening hours',n_contact:'Contact',cart_btn:'Order',eyebrow:'Lunchroom in Gorinchem',h1a:'Freshly made,',h1b:'delivered home or ready to collect.',lead:'Sandwiches, wraps, platters, kapsalons and more. Made with fresh ingredients and the warmth of Eastern cuisine.',order_now:'Order now',hours:'Opening hours',f1:'Prepared fresh daily',f2:'Pick-up or delivery',f3:'Track your order live',shop_h:'Order online',search_l:'Search the menu',search_ph:'Search a dish',i_h1:'Opening hours',i_h2:'Address',i_h3:'Ordering',i_p3:'Order directly online here, or choose delivery via Thuisbezorgd.',route:'Route in Google Maps',f_pay:'Pick-up and delivery in Gorinchem and surroundings',view_order:'View order',open:'Open now · until {t}',closed1:'Closed · opens today at {t}',closed2:'Closed · opens tomorrow at {t}',hours_txt:'Every day from {a} to {b}',menu_hint:'Menu = with fries and a drink',loose:'Single',menu:'Menu',add:'Add',added:'Added',none:'No results',your:'Your order',empty:'Your order is empty.',sub:'Subtotal',total:'Total',checkout:'Checkout',back:'Back',pickup:'Pick-up',delivery:'Delivery',name:'Name',phone:'Phone',email:'Email',street:'Street and number',postcode:'Postcode',city:'City',time:'Time',asap:'As soon as possible',note:'Note (optional)',paywith:'Pay with',pay:'Pay',cash:'Cash on pick-up',remove:'Remove',req:'Please fill in this field',min:'Minimum order is {m}',thanks:'Thank you for your order!',order:'Order number',show_e:'Featured',show_h:'Our favourites',soon:'Photo coming soon',eta_pick:'Ready for pick-up in about {a}–{b} minutes',eta_del:'Expected delivery in about {a}–{b} minutes',fee_city:'Delivery fee',fee_out:'Delivery fee ({km} km)',fee_free:'Free delivery',calc:'Calculating delivery fee…',fill_addr:'Enter your address to see the delivery fee.',q_noaddr:'Address not found. Check street, postcode and city.',q_far:'This address is outside our delivery area (max. {m} km).',q_net:'Could not calculate the delivery fee. Please try again.',freehint:'{x} more for free delivery',mail_sent:'We will send a confirmation to {e}.',info_del:'Delivery: € 2 (up to 17.5 km), free from € 60.',track:'Follow your order and see when it arrives',privacy_l:'Privacy',date:'Date',today:'Today',tomorrow:'Tomorrow',closed_day:'closed',full:'full',slot_none:'No times available on this day. Choose another day.',slot_chosen:'Chosen time: {s}',privacy:'We only use your details for this order.',pay_off:'Online payment is not available yet.',delivery_off:'Delivery is currently unavailable.',info_del2:'Delivery: € {fee} (up to {km} km), free from € {free}.',hw:'Monday to Saturday',hs:'Sunday',noslot:'Closed now. Please order again during opening hours.',demo:'This is a sample website: no real payment was made and the order was not sent yet.',close:'Close',fee:'Delivery fee',redir:'Taking you to the payment page…',fail:'Could not start the payment. Please try again.',dnote:'Delivery: you pay online.'},
tr:{n_menu:'Menü',n_info:'Çalışma saatleri',n_contact:'İletişim',cart_btn:'Sipariş',eyebrow:'Gorinchem’de lunchroom',h1a:'Taze hazırlanır,',h1b:'eve gelir veya gelip alırsınız.',lead:'Sandviç, dürüm, tabak, kapsalon ve daha fazlası. Taze malzemeler ve Doğu mutfağının sıcaklığıyla hazırlanır.',order_now:'Sipariş ver',hours:'Çalışma saatleri',f1:'Her gün taze',f2:'Gel-al veya eve teslim',f3:'Siparişini canlı takip et',shop_h:'Online sipariş',search_l:'Menüde ara',search_ph:'Yemek ara',i_h1:'Çalışma saatleri',i_h2:'Adres',i_h3:'Sipariş',i_p3:'Buradan doğrudan sipariş verin veya Thuisbezorgd ile teslimat seçin.',route:'Google Maps\'te yol tarifi',f_pay:'Gorinchem ve çevresinde gel-al ve eve teslim',view_order:'Siparişi gör',open:'Şu an açık · {t}\'e kadar',closed1:'Kapalı · bugün {t}\'da açılır',closed2:'Kapalı · yarın {t}\'da açılır',hours_txt:'Her gün {a} – {b}',menu_hint:'Menü = patates ve içecek ile',loose:'Tek',menu:'Menü',add:'Ekle',added:'Eklendi',none:'Sonuç yok',your:'Siparişin',empty:'Siparişin boş.',sub:'Ara toplam',total:'Toplam',checkout:'Ödemeye geç',back:'Geri',pickup:'Gel-al',delivery:'Eve teslim',name:'Ad',phone:'Telefon',email:'E-posta',street:'Sokak ve numara',postcode:'Posta kodu',city:'Şehir',time:'Saat',asap:'En kısa sürede',note:'Not (isteğe bağlı)',paywith:'Ödeme yöntemi',pay:'Öde',cash:'Gel-alda nakit',remove:'Kaldır',req:'Bu alanı doldurun',min:'Minimum sipariş {m}',thanks:'Siparişin için teşekkürler!',order:'Sipariş no',show_e:'Öne çıkanlar',show_h:'Favorilerimiz',soon:'Fotoğraf yakında',eta_pick:'Gel-al için yaklaşık {a}–{b} dakika içinde hazır',eta_del:'Tahmini teslimat yaklaşık {a}–{b} dakika',fee_city:'Teslimat ücreti',fee_out:'Teslimat ücreti ({km} km)',fee_free:'Ücretsiz teslimat',calc:'Teslimat ücreti hesaplanıyor…',fill_addr:'Teslimat ücretini görmek için adresini gir.',q_noaddr:'Adres bulunamadı. Sokak, posta kodu ve şehri kontrol et.',q_far:'Bu adres teslimat bölgemizin dışında (en fazla {m} km).',q_net:'Teslimat ücreti hesaplanamadı. Tekrar dene.',freehint:'Ücretsiz teslimata {x} kaldı',mail_sent:'{e} adresine onay göndereceğiz.',info_del:'Teslimat: 2 € (17,5 km\'ye kadar), 60 €\'dan itibaren ücretsiz.',track:'Siparişini takip et ve ne zaman geleceğini gör',privacy_l:'Gizlilik',date:'Tarih',today:'Bugün',tomorrow:'Yarın',closed_day:'kapalı',full:'dolu',slot_none:'Bu gün için uygun saat yok. Başka bir gün seçin.',slot_chosen:'Seçilen saat: {s}',privacy:'Bilgilerinizi yalnızca bu sipariş için kullanırız.',pay_off:'Online ödeme henüz kullanılamıyor.',delivery_off:'Teslimat şu anda mümkün değil.',info_del2:'Teslimat: {fee} € ({km} km\'ye kadar), {free} €\'dan itibaren ücretsiz.',hw:'Pazartesi – Cumartesi',hs:'Pazar',noslot:'Şu an kapalı. Lütfen çalışma saatlerinde sipariş verin.',demo:'Bu bir örnek sitedir: gerçek ödeme yapılmadı ve sipariş henüz iletilmedi.',close:'Kapat',fee:'Teslimat ücreti',redir:'Ödeme sayfasına yönlendiriliyorsun…',fail:'Ödeme başlatılamadı. Tekrar dene.',dnote:'Eve teslim: online ödersiniz.'},
ar:{n_menu:'القائمة',n_info:'ساعات العمل',n_contact:'اتصل بنا',cart_btn:'الطلب',eyebrow:'لانشروم · خورينخم',h1a:'طازج دائماً،',h1b:'يصلك إلى البيت أو تستلمه بنفسك.',lead:'ساندويتشات ولفائف وأطباق وكابسالون والمزيد. يُحضَّر من مكونات طازجة وبدفء المطبخ الشرقي.',order_now:'اطلب الآن',hours:'ساعات العمل',f1:'طازج كل يوم',f2:'استلام أو توصيل',f3:'تابع طلبك مباشرة',shop_h:'اطلب عبر الإنترنت',search_l:'ابحث في القائمة',search_ph:'ابحث عن طبق',i_h1:'ساعات العمل',i_h2:'العنوان',i_h3:'الطلب',i_p3:'اطلب مباشرة من هنا أو اختر التوصيل عبر Thuisbezorgd.',route:'المسار في خرائط Google',f_pay:'استلام وتوصيل في خورينخم وما حولها',view_order:'عرض الطلب',open:'مفتوح الآن · حتى {t}',closed1:'مغلق · يفتح اليوم الساعة {t}',closed2:'مغلق · يفتح غداً الساعة {t}',hours_txt:'كل يوم من {a} إلى {b}',menu_hint:'الوجبة = مع بطاطس ومشروب',loose:'منفرد',menu:'وجبة',add:'أضف',added:'تمت الإضافة',none:'لا نتائج',your:'طلبك',empty:'طلبك فارغ.',sub:'المجموع الفرعي',total:'الإجمالي',checkout:'إتمام الطلب',back:'رجوع',pickup:'استلام',delivery:'توصيل',name:'الاسم',phone:'الهاتف',email:'البريد الإلكتروني',street:'الشارع والرقم',postcode:'الرمز البريدي',city:'المدينة',time:'الوقت',asap:'في أقرب وقت',note:'ملاحظة (اختياري)',paywith:'الدفع عبر',pay:'ادفع',cash:'نقداً عند الاستلام',remove:'إزالة',req:'يرجى ملء هذا الحقل',min:'الحد الأدنى للطلب {m}',thanks:'شكراً لطلبك!',order:'رقم الطلب',show_e:'مميز',show_h:'أطباقنا المفضلة',soon:'الصورة قريباً',eta_pick:'جاهز للاستلام خلال حوالي {a}–{b} دقيقة',eta_del:'التوصيل المتوقع خلال حوالي {a}–{b} دقيقة',fee_city:'رسوم التوصيل',fee_out:'رسوم التوصيل ({km} كم)',fee_free:'توصيل مجاني',calc:'جارٍ حساب رسوم التوصيل…',fill_addr:'أدخل عنوانك لرؤية رسوم التوصيل.',q_noaddr:'لم يتم العثور على العنوان. تحقق من الشارع والرمز البريدي والمدينة.',q_far:'هذا العنوان خارج منطقة التوصيل (بحد أقصى {m} كم).',q_net:'تعذر حساب رسوم التوصيل. حاول مرة أخرى.',freehint:'تبقى {x} للحصول على توصيل مجاني',mail_sent:'سنرسل تأكيداً إلى {e}.',info_del:'التوصيل: 2 يورو (حتى 17,5 كم)، مجاني من 60 يورو.',track:'تابع طلبك واعرف متى يصل',privacy_l:'الخصوصية',date:'التاريخ',today:'اليوم',tomorrow:'غداً',closed_day:'مغلق',full:'ممتلئ',slot_none:'لا توجد أوقات متاحة في هذا اليوم. اختر يوماً آخر.',slot_chosen:'الوقت المختار: {s}',privacy:'نستخدم بياناتك لهذا الطلب فقط.',pay_off:'الدفع عبر الإنترنت غير متاح بعد.',delivery_off:'التوصيل غير متاح حالياً.',info_del2:'التوصيل: {fee} يورو (حتى {km} كم)، مجاني من {free} يورو.',hw:'من الاثنين إلى السبت',hs:'الأحد',noslot:'مغلق الآن. يرجى الطلب خلال ساعات العمل.',demo:'هذا موقع تجريبي: لم يتم أي دفع حقيقي ولم يُرسل الطلب بعد.',close:'إغلاق',fee:'رسوم التوصيل',redir:'جارٍ تحويلك إلى صفحة الدفع…',fail:'تعذر بدء الدفع. حاول مرة أخرى.',dnote:'التوصيل: الدفع عبر الإنترنت.'}
};
var lang='nl';
var T2={
nl:{sort_l:'Sorteren',sort_std:'Standaard',sort_lo:'Prijs: laag naar hoog',sort_hi:'Prijs: hoog naar laag',sort_az:'Naam: A tot Z',count_n:'{n} gerechten',skip:'Naar de inhoud',route_h:'Je route naar Bassma',route_a:'Koningin Wilhelminalaan 34, Gorinchem',n_home:'Home',story_e:'Ons verhaal',story_h:'Welkom bij Bassma',story_p:'In onze lunchroom in Gorinchem maken we elke dag broodjes, wraps, schotels en kapsalons met verse ingrediënten. Van een uitgebreid ontbijt tot een stevige maaltijd: kom gezellig langs of laat het bij je thuis bezorgen.',cta_h:'Honger gekregen?',cta_p:'Kies je favorieten en bestel direct online. Afhalen of bezorgen, jij bepaalt.',menu_lead:'Kies je gerechten en bestel direct. Afhalen of bezorgen.',contact_h:'Openingstijden en contact',contact_p:'Kom langs, bel ons of bestel online.',h_trek:'Waar heb je trek in?',h_pop:'Uit de keuken',all_menu:'Bekijk de volledige kaart',h_steps:'Zo werkt bestellen',s1:'Kies je gerechten',s2:'Kies afhalen of bezorgen',s3:'Betaal en volg je bestelling',tile_count:'{n} gerechten',call:'Bel Bassma',route2:'Route bekijken',foot_nav:'Snel naar',visit_h:'Kom langs of bestel online'},
en:{sort_l:'Sort by',sort_std:'Featured',sort_lo:'Price: low to high',sort_hi:'Price: high to low',sort_az:'Name: A to Z',count_n:'{n} dishes',skip:'Skip to content',route_h:'Your way to Bassma',route_a:'Koningin Wilhelminalaan 34, Gorinchem',n_home:'Home',story_e:'Our story',story_h:'Welcome to Bassma',story_p:'In our lunchroom in Gorinchem we make sandwiches, wraps, platters and kapsalons with fresh ingredients every day. From a full breakfast to a hearty meal: drop by, or have it delivered to your door.',cta_h:'Feeling hungry?',cta_p:'Pick your favourites and order online. Pick-up or delivery, you decide.',menu_lead:'Choose your dishes and order straight away. Pick-up or delivery.',contact_h:'Opening hours and contact',contact_p:'Drop by, call us or order online.',h_trek:'What are you in the mood for?',h_pop:'From the kitchen',all_menu:'See the full menu',h_steps:'How ordering works',s1:'Choose your dishes',s2:'Choose pick-up or delivery',s3:'Pay and follow your order',tile_count:'{n} dishes',call:'Call Bassma',route2:'Get directions',foot_nav:'Quick links',visit_h:'Visit us or order online'},
tr:{sort_l:'Sırala',sort_std:'Öne çıkanlar',sort_lo:'Fiyat: düşükten yükseğe',sort_hi:'Fiyat: yüksekten düşüğe',sort_az:'Ad: A’dan Z’ye',count_n:'{n} yemek',skip:'İçeriğe geç',route_h:'Bassma’ya giden yol',route_a:'Koningin Wilhelminalaan 34, Gorinchem',n_home:'Ana sayfa',story_e:'Hikayemiz',story_h:'Bassma’ya hoş geldiniz',story_p:'Gorinchem’deki lunchroom’umuzda her gün taze malzemelerle sandviç, dürüm, tabak ve kapsalon hazırlıyoruz. Kapsamlı bir kahvaltıdan doyurucu bir yemeğe: uğrayın ya da evinize getirelim.',cta_h:'Acıktın mı?',cta_p:'Favorilerini seç ve online sipariş ver. Gel-al veya eve teslim, sen karar ver.',menu_lead:'Yemeklerini seç ve hemen sipariş ver. Gel-al veya eve teslim.',contact_h:'Çalışma saatleri ve iletişim',contact_p:'Uğrayın, arayın ya da online sipariş verin.',h_trek:'Canın ne çekiyor?',h_pop:'Mutfağımızdan',all_menu:'Tüm menüyü gör',h_steps:'Sipariş nasıl verilir',s1:'Yemeklerini seç',s2:'Gel-al veya eve teslim seç',s3:'Öde ve siparişini takip et',tile_count:'{n} yemek',call:'Bassma’yı ara',route2:'Yol tarifi',foot_nav:'Hızlı bağlantılar',visit_h:'Uğra veya online sipariş ver'},
ar:{sort_l:'ترتيب',sort_std:'مميز',sort_lo:'السعر: من الأقل إلى الأعلى',sort_hi:'السعر: من الأعلى إلى الأقل',sort_az:'الاسم: أ إلى ي',count_n:'{n} أطباق',skip:'انتقل إلى المحتوى',route_h:'طريقك إلى Bassma',route_a:'Koningin Wilhelminalaan 34, Gorinchem',n_home:'الرئيسية',story_e:'قصتنا',story_h:'أهلاً بكم في Bassma',story_p:'في مطعمنا في خورينخم نحضّر كل يوم ساندويتشات ولفائف وأطباقاً وكابسالون من مكونات طازجة. من فطور كامل إلى وجبة مشبعة: تفضلوا بزيارتنا أو نوصّل إلى باب بيتكم.',cta_h:'هل أنت جائع؟',cta_p:'اختر أطباقك المفضلة واطلب عبر الإنترنت. استلام أو توصيل، أنت تقرر.',menu_lead:'اختر أطباقك واطلب مباشرة. استلام أو توصيل.',contact_h:'ساعات العمل والاتصال',contact_p:'زورونا أو اتصلوا بنا أو اطلبوا عبر الإنترنت.',h_trek:'ماذا تشتهي؟',h_pop:'من مطبخنا',all_menu:'عرض القائمة كاملة',h_steps:'كيف تطلب',s1:'اختر أطباقك',s2:'اختر استلام أو توصيل',s3:'ادفع وتابع طلبك',tile_count:'{n} أطباق',call:'اتصل بـ Bassma',route2:'احصل على الاتجاهات',foot_nav:'روابط سريعة',visit_h:'زرنا أو اطلب عبر الإنترنت'}
};
Object.keys(T2).forEach(function(l){Object.assign(T[l],T2[l])});
var TILES=['broodjes','wraps','schotels','kapsalon','pizza','burgers'];
var TICON={broodjes:'<path d="M4 10c0-3 3.5-5 8-5s8 2 8 5z"/><path d="M3 13h18"/><path d="M5 16h14"/><path d="M5 16c0 2 1.5 3 3 3h8c1.5 0 3-1 3-3"/>',wraps:'<path d="M5 18L16 6a3 3 0 014 4L9 21z"/><path d="M13 9l5 5"/>',schotels:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',kapsalon:'<path d="M6 10l1.5 10h9L18 10z"/><path d="M8 10V4M11 10V3M14 10V4M16.5 10V5"/>',pizza:'<path d="M12 21L4 7a14 14 0 0116 0z"/><circle cx="10" cy="10" r="1"/><circle cx="14" cy="12" r="1"/><circle cx="12" cy="16" r="1"/>',burgers:'<path d="M4 11a8 6 0 0116 0z"/><path d="M3 14h18"/><path d="M4 17h16v1a2 2 0 01-2 2H6a2 2 0 01-2-2z"/>'};
var POP=[['omelet','Omelet met sucuk',1],['wraps','Shoarma',2],['kapsalon','Crispy chicken',3]];
function catOf(id){return MENU.filter(function(c){return c.id===id})[0]}
function renderHome(){
  if(!$('#tiles'))return;
  var h='';
  TILES.forEach(function(id){var c=catOf(id);if(!c)return;h+='<a class="tile" href="menu.html#c-'+id+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+TICON[id]+'</svg><b>'+nm(c.n)+'</b><span>'+t('tile_count',{n:c.i.length})+'</span></a>'});
  $('#tiles').innerHTML=h;
  var p='';
  POP.forEach(function(x){var c=catOf(x[0]);if(!c)return;var it=c.i.filter(function(y){return y[0]===x[1]})[0];if(!it)return;
    p+='<article class="pc"><div class="pimg"><img src="images/gerechten/gerecht-'+x[2]+'.png" alt="" loading="lazy"></div><div class="pbody"><small>'+nm(c.n)+'</small><h3>'+nm(it[0])+'</h3><div class="pf"><span>'+eur(it[1])+'</span><button class="padd" data-id="'+c.id+'|'+it[0]+'" data-v="0" aria-label="'+t('add')+'">+</button></div></div></article>'});
  $('#popular').innerHTML=p;
}
if(document.getElementById('popular'))document.getElementById('popular').addEventListener('click',function(e){var b=e.target.closest('.padd');if(b)addItem(b.dataset.id,+b.dataset.v)});
function t(k,v){var s=(T[lang]&&T[lang][k])||T.nl[k]||k;if(v)for(var x in v)s=s.replace('{'+x+'}',v[x]);return s}
function eur(n){return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(n)}
function fmtT(a){return String(a[0]).padStart(2,'0')+':'+String(a[1]).padStart(2,'0')}

/* ===== namen van gerechten in andere talen (sleutel = Nederlandse naam; ontbrekend = merknaam, blijft gelijk) ===== */
var N={
'Ontbijt':['Breakfast','Kahvaltı','فطور'],'Omelet':['Omelettes','Omletler','عجّة'],'Broodjes':['Sandwiches','Sandviçler','ساندويتشات'],'Wraps':['Wraps','Dürümler','لفائف'],'Schotels':['Platters','Tabaklar','أطباق'],'Kapsalon':['Kapsalon','Kapsalon','كابسالون'],'Turkse pizza’s':['Turkish pizzas','Türk pizzaları','بيتزا تركية'],'Taco’s':['Tacos','Takolar','تاكو'],'Burgers':['Burgers','Burgerler','برغر'],'Box':['Box','Kutu','علبة'],'Panini’s':['Paninis','Paniniler','بانيني'],'Kindermenu':['Kids menu','Çocuk menüsü','قائمة الأطفال'],'Salades':['Salads','Salatalar','سلطات'],'Snacks':['Snacks','Atıştırmalıklar','سناكس'],'Extra’s':['Extras','Ekstralar','إضافات'],'Dranken':['Drinks','İçecekler','مشروبات'],'Toetjes':['Desserts','Tatlılar','حلويات'],
'Met friet of rijst, salade en pitabroodje':['With fries or rice, salad and pita bread','Patates veya pilav, salata ve pide ile','مع بطاطس أو أرز وسلطة وخبز بيتا'],'Met friet of rijst, salade en saus':['With fries or rice, salad and sauce','Patates veya pilav, salata ve sos ile','مع بطاطس أو أرز وسلطة وصلصة'],'Met friet en saus':['With fries and sauce','Patates ve sos ile','مع بطاطس وصلصة'],
'Luxe ontbijt':['Luxury breakfast','Lüks kahvaltı','فطور فاخر'],'Marokkaans ontbijt':['Moroccan breakfast','Fas kahvaltısı','فطور مغربي'],
'Omelet met chatarsalami':['Salami omelette','Salamlı omlet','عجة بالسلامي'],'Omelet met kip':['Chicken omelette','Tavuklu omlet','عجة بالدجاج'],'Omelet met sucuk':['Sucuk omelette','Sucuklu omlet','عجة بالسجق'],'Omelet met grillworst':['Grilled sausage omelette','Izgara sosisli omlet','عجة بالنقانق المشوية'],'Omelet naturel':['Plain omelette','Sade omlet','عجة سادة'],
'Kip speciaal':['Special chicken','Özel tavuk','دجاج سبيشال'],'Sucuk kaas':['Sucuk and cheese','Sucuk kaşar','سجق وجبن'],'Salami':['Salami','Salam','سلامي'],'Americain crispy chicken':['Americain with crispy chicken','Americain ve çıtır tavuk','أمريكان مع دجاج مقرمش'],'BBQ gehakt':['BBQ minced meat','BBQ kıyma','لحم مفروم باربيكيو'],'Garnalen':['Prawns','Karides','جمبري'],'BBQ kip':['BBQ chicken','BBQ tavuk','دجاج باربيكيو'],'Kipfilet':['Chicken fillet','Tavuk fileto','فيليه دجاج'],'Kip kerrie':['Curry chicken','Körili tavuk','دجاج بالكاري'],'Gezond':['Healthy','Sağlıklı','صحي'],'Kip grillworst':['Chicken and grilled sausage','Tavuk ve izgara sosis','دجاج ونقانق مشوية'],'Kip grillworst pikant':['Chicken and spicy grilled sausage','Tavuk ve acılı izgara sosis','دجاج ونقانق مشوية حارة'],
'Shoarma':['Shawarma','Şawarma','شاورما'],'Crispy chicken':['Crispy chicken','Çıtır tavuk','دجاج مقرمش'],'Falafel':['Falafel','Falafel','فلافل'],'Tonijn':['Tuna','Ton balığı','تونة'],
'Lamsshoarma':['Lamb shawarma','Kuzu şawarma','شاورما لحم الضأن'],'Crispy chicken wings':['Crispy chicken wings','Çıtır tavuk kanat','أجنحة دجاج مقرمشة'],'Mix':['Mix','Karışık','مشكل'],'Crispy chicken tenders':['Crispy chicken tenders','Çıtır tavuk tenders','تندرز دجاج مقرمش'],'BBQ kipfilet':['BBQ chicken fillet','BBQ tavuk fileto','فيليه دجاج باربيكيو'],'Kipfilet pikant':['Spicy chicken fillet','Acılı tavuk fileto','فيليه دجاج حار'],'Kip':['Chicken','Tavuk','دجاج'],'Bassma schotel speciaal':['Bassma special platter','Bassma özel tabak','طبق بسمة الخاص'],
'Bassma':['Bassma','Bassma','بسمة'],'Kipdöner':['Chicken doner','Tavuk döner','دونر دجاج'],
'Met kaas':['With cheese','Peynirli','بالجبن'],'Basis':['Plain','Sade','سادة'],'Met kip':['With chicken','Tavuklu','بالدجاج'],'Met lamsshoarma':['With lamb shawarma','Kuzu şawarmalı','بشاورما لحم الضأن'],
'Quesadilla taco':['Quesadilla taco','Kesadilya tako','تاكو كيساديا'],'Taco shoarma':['Shawarma taco','Şawarma tako','تاكو شاورما'],'Taco kip':['Chicken taco','Tavuk tako','تاكو دجاج'],'Franse taco gehakt':['French taco with minced meat','Kıymalı Fransız tako','تاكو فرنسي باللحم المفروم'],'Franse taco kip':['French taco with chicken','Tavuklu Fransız tako','تاكو فرنسي بالدجاج'],'Tiktaco':['TikTaco','TikTaco','تيك تاكو'],
'BBQ kipfilet burger':['BBQ chicken fillet burger','BBQ tavuk fileto burger','برغر فيليه دجاج باربيكيو'],'Bassma burger':['Bassma burger','Bassma burger','برغر بسمة'],'Fish burger':['Fish burger','Balık burger','برغر سمك'],'Beefburger':['Beef burger','Dana burger','برغر لحم بقري'],'Beefburger double':['Double beef burger','Çift dana burger','برغر لحم بقري مزدوج'],'Crisp burger':['Crispy burger','Çıtır burger','برغر مقرمش'],
'Hete kip':['Hot chicken','Acılı tavuk','دجاج حار'],
'Tonijn met kaas':['Tuna and cheese','Ton balıklı kaşarlı','تونة وجبن'],'Pesto grillworst':['Pesto grilled sausage','Pesto izgara sosis','نقانق مشوية بالبيستو'],'Grillworst pikant':['Spicy grilled sausage','Acılı izgara sosis','نقانق مشوية حارة'],'Sucuk met kaas':['Sucuk with cheese','Sucuklu kaşarlı','سجق بالجبن'],'Grillworst':['Grilled sausage','Izgara sosis','نقانق مشوية'],
'Chicken strips':['Chicken strips','Tavuk şeritleri','شرائح دجاج'],'Crispy burger':['Crispy burger','Çıtır burger','برغر مقرمش'],'Kipnuggets (6 stuks)':['Chicken nuggets (6 pcs)','Tavuk nugget (6 adet)','ناجتس دجاج (6 قطع)'],'Chicken wings':['Chicken wings','Tavuk kanat','أجنحة دجاج'],'Cheeseburger':['Cheeseburger','Cheeseburger','تشيز برغر'],
'Kipsalade':['Chicken salad','Tavuk salata','سلطة دجاج'],'Falafel salade':['Falafel salad','Falafel salata','سلطة فلافل'],'Crispy chicken salade':['Crispy chicken salad','Çıtır tavuk salata','سلطة دجاج مقرمش'],'Tonijnsalade':['Tuna salad','Ton balıklı salata','سلطة تونة'],
'Friet':['Fries','Patates kızartması','بطاطس مقلية'],'Chicken bucket':['Chicken bucket','Tavuk kovası','دلو دجاج'],'Chicken tenders (5 stuks)':['Chicken tenders (5 pcs)','Tavuk tenders (5 adet)','تندرز دجاج (5 قطع)'],'Kipnuggets':['Chicken nuggets','Tavuk nugget','ناجتس دجاج'],'Hotwings':['Hot wings','Acılı kanat','أجنحة حارة'],'Frikandel':['Frikandel','Frikandel','فريكاندل'],'Mexicano':['Mexicano','Mexicano','مكسيكانو'],'Kipcorn':['Kipcorn','Kipcorn','كيبكورن'],
'Extra worst':['Extra sausage','Ekstra sosis','نقانق إضافية'],'Extra kipfilet':['Extra chicken fillet','Ekstra tavuk fileto','فيليه دجاج إضافي'],'Extra gehakt':['Extra minced meat','Ekstra kıyma','لحم مفروم إضافي'],'Vers brood':['Fresh bread','Taze ekmek','خبز طازج'],'Klein bakje rijst':['Small tub of rice','Küçük kutu pilav','علبة أرز صغيرة'],'Groot bakje rijst':['Large tub of rice','Büyük kutu pilav','علبة أرز كبيرة'],'Klein bakje kip':['Small tub of chicken','Küçük kutu tavuk','علبة دجاج صغيرة'],'Groot bakje kip':['Large tub of chicken','Büyük kutu tavuk','علبة دجاج كبيرة'],
'Saus: Andalousesaus':['Sauce: Andalouse','Sos: Andaluz','صلصة: أندلوز'],'Saus: Mayonaise':['Sauce: Mayonnaise','Sos: Mayonez','صلصة: مايونيز'],'Saus: BBQ saus':['Sauce: BBQ','Sos: BBQ','صلصة: باربيكيو'],'Saus: Kaas':['Sauce: Cheese','Sos: Peynir','صلصة: جبن'],'Saus: Samuraisaus':['Sauce: Samurai','Sos: Samuray','صلصة: ساموراي'],'Saus: Knoflooksaus':['Sauce: Garlic','Sos: Sarımsak','صلصة: ثوم'],'Saus: Sambal':['Sauce: Sambal','Sos: Sambal','صلصة: سامبال'],
'Ayran cherry 250ml':['Cherry ayran 250ml','Vişneli ayran 250ml','عيران بالكرز 250مل'],'Spa blauw 330ml':['Spa Blue still water 330ml','Spa mavi su 330ml','سبا أزرق ماء 330مل'],'Spa rood 330ml':['Spa Red sparkling water 330ml','Spa kırmızı soda 330ml','سبا أحمر ماء غازي 330مل'],'Verso aardbei 250ml':['Verso strawberry 250ml','Verso çilek 250ml','فيرسو فراولة 250مل'],'Verso mango-sinaasappel 250ml':['Verso mango-orange 250ml','Verso mango-portakal 250ml','فيرسو مانجو وبرتقال 250مل'],'Verso pomegranate 250ml':['Verso pomegranate 250ml','Verso nar 250ml','فيرسو رمان 250مل'],'Verse appel 250ml':['Fresh apple 250ml','Taze elma 250ml','تفاح طازج 250مل'],'Red Bull Energy Drink Watermeloen 250ml':['Red Bull Energy Drink Watermelon 250ml','Red Bull Enerji İçeceği Karpuz 250ml','ريد بول مشروب الطاقة بطيخ 250مل'],
'Cheesecake':['Cheesecake','Cheesecake','تشيز كيك'],'Baklava':['Baklava','Baklava','بقلاوة'],'Chocolate cake':['Chocolate cake','Çikolatalı kek','كعكة الشوكولاتة'],'Red velvet':['Red velvet','Red velvet','ريد فيلفيت']
};
function nm(s){var v=N[s];return(v&&lang!=='nl')?v[{en:0,tr:1,ar:2}[lang]]:s}

/* ===== vlaggen ===== */
var FL={
nl:'<svg viewBox="0 0 30 20"><rect width="30" height="7" fill="#AE1C28"/><rect y="7" width="30" height="6" fill="#fff"/><rect y="13" width="30" height="7" fill="#21468B"/></svg>',
en:'<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.6"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/><path d="M15 0V20M0 10H30" stroke="#C8102E" stroke-width="3.4"/></svg>',
tr:'<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#E30A17"/><circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.4" cy="10" r="4" fill="#E30A17"/><path d="M17.5 7.2l.9 2.2 2.3.1-1.8 1.4.6 2.3-2-1.3-2 1.3.6-2.3-1.8-1.4 2.3-.1z" fill="#fff"/></svg>',
ar:'<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#006C35"/><path d="M6 7.2q1.2-2 2.4 0t2.4 0 2.4 0 2.4 0 2.4 0 2.4 0" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><path d="M7 14.2H23" stroke="#fff" stroke-width="1"/><path d="M21.5 13.2v2M7 13.7h1.6" stroke="#fff" stroke-width="1"/></svg>'
};
var NAMES={nl:'Nederlands',en:'English',tr:'Türkçe',ar:'العربية'};
['langs1'].forEach(function(id){var e=document.getElementById(id);if(!e)return;Object.keys(FL).forEach(function(l){var b=document.createElement('button');b.dataset.l=l;b.title=NAMES[l];b.setAttribute('aria-label',NAMES[l]);b.innerHTML=FL[l];b.onclick=function(){setLang(l)};e.appendChild(b)})});

var lpm=document.getElementById('lpm'),lpb=document.getElementById('lpb');
Object.keys(FL).forEach(function(l){var b=document.createElement('button');b.dataset.l=l;b.innerHTML=FL[l]+'<span>'+NAMES[l]+'</span>';b.onclick=function(){setLang(l);lpm.classList.remove('open');lpb.setAttribute('aria-expanded','false')};lpm.appendChild(b)});
lpb.onclick=function(e){e.stopPropagation();var o=lpm.classList.toggle('open');lpb.setAttribute('aria-expanded',o)};
document.addEventListener('click',function(e){if(!e.target.closest('#lp')){lpm.classList.remove('open');lpb.setAttribute('aria-expanded','false')}});
/* ===== menu tekenen ===== */
var $=function(s){return document.querySelector(s)};
var q='';
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-')}
var CICON={ontbijt:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',omelet:'<circle cx="10" cy="12" r="6.5"/><circle cx="10" cy="12" r="2.4"/><path d="M16.5 12H21"/>',taco:'<path d="M3 17a9 9 0 0118 0z"/><path d="M7 14l1-2M11 13l1-3M15 14l1-2"/>',box:'<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>',panini:'<path d="M4 15a8 5 0 0116 0v2H4z"/><path d="M6 12h12"/>',kids:'<circle cx="12" cy="8" r="3"/><path d="M6 20c0-3.5 2.5-6 6-6s6 2.5 6 6z"/>',salades:'<path d="M4 12h16a8 8 0 01-16 0z"/><path d="M8 12c0-3 2-5 4-5s4 2 4 5"/>',snacks:'<path d="M7 20L5 8h14l-2 12z"/><path d="M9 8V4M12 8V3M15 8V4"/>',extras:'<path d="M12 5v14M5 12h14"/>',dranken:'<path d="M7 4h10l-1 16H8z"/><path d="M7 9h10"/>',toetjes:'<path d="M6 12h12l-1.5 8h-9z"/><circle cx="12" cy="8" r="4"/>'};
Object.keys(TICON).forEach(function(k){CICON[k]=TICON[k]});
var sortMode='std';
var PHOTO={};   /* geen eetfoto's in het menu: alle kaarten zien er gelijk uit */
function renderMenu(){
  if(!$('#menu'))return;
  var h='',c='',total=0;
  MENU.forEach(function(cat,ci){
    var items=cat.i.filter(function(x){return !q||(x[0]+' '+nm(x[0])+' '+cat.n+' '+nm(cat.n)).toLowerCase().indexOf(q)>-1});
    if(!items.length)return;
    if(sortMode==='lo')items=items.slice().sort(function(a,b){return a[1]-b[1]});
    else if(sortMode==='hi')items=items.slice().sort(function(a,b){return b[1]-a[1]});
    else if(sortMode==='az')items=items.slice().sort(function(a,b){return nm(a[0]).localeCompare(nm(b[0]),lang)});
    total+=items.length;
    c+='<a href="#c-'+cat.id+'" data-c="'+cat.id+'">'+nm(cat.n)+'</a>';
    var sub=(cat.s||cat.m)?'<p class="sub">'+(cat.s?nm(cat.s)+(cat.m?' · ':''):'')+(cat.m?t('menu_hint'):'')+'</p>':'';
    var icon='<svg viewBox="0 0 24 24" aria-hidden="true">'+(CICON[cat.id]||CICON.extras)+'</svg>';
    h+='<section class="cat" id="c-'+cat.id+'"><div class="chead"><span class="cicon">'+icon+'</span><div class="ctxt"><h3>'+nm(cat.n)+'</h3>'+sub+'</div><span class="ccount">'+items.length+'</span></div><div class="pgrid">';
    items.forEach(function(x){
      var id=cat.id+'|'+x[0],ph=PHOTO[id],two=!!x[2];
      var media=ph?'<img src="images/gerechten/gerecht-'+ph+'.png" alt="" loading="lazy">':'<span class="ico">'+icon+'</span>';
      h+='<article class="pcard" data-item="'+id+'"><div class="pmedia tone'+(ci%3)+(ph?' hasimg':'')+'">'+media+'<span class="qb" aria-hidden="true"></span></div><div class="pinfo"><small class="pcat">'+nm(cat.n)+'</small><h4>'+nm(x[0])+'</h4>';
      if(two)h+='<div class="pvar" role="group" aria-label="'+t('loose')+' / '+t('menu')+'"><button type="button" class="vp on" data-v="0" data-p="'+eur(x[1])+'" aria-pressed="true"><span>'+t('loose')+'</span><b>'+eur(x[1])+'</b></button><button type="button" class="vp" data-v="1" data-p="'+eur(x[2])+'" aria-pressed="false"><span>'+t('menu')+'</span><b>'+eur(x[2])+'</b></button></div>';
      h+='<div class="pbuy"><span class="pprice">'+eur(x[1])+'</span><button class="add" data-id="'+id+'" data-v="0">'+t('add')+'</button></div></div></article>';
    });
    h+='</div></section>';
  });
  $('#menu').innerHTML=h||'<p class="empty">'+t('none')+'</p>';
  $('#chips').innerHTML=c;
  if($('#pcount'))$('#pcount').textContent=t('count_n',{n:total});
  observe();markCart();
}function markCart(){
  var n={};((typeof cart!=='undefined'&&cart)||[]).forEach(function(l){n[l.id]=(n[l.id]||0)+l.q});
  document.querySelectorAll('.item[data-item],.pcard[data-item]').forEach(function(e){var k=n[e.dataset.item]||0;e.classList.toggle('in',k>0);var qb=e.querySelector('.qb');if(qb)qb.textContent=k||''});
}function find(id){var p=id.split('|');var cat=MENU.filter(function(c){return c.id===p[0]})[0];var it=cat.i.filter(function(x){return x[0]===p[1]})[0];return{cat:cat,it:it}}
var io;
function observe(){
  if(io)io.disconnect();
  if(!('IntersectionObserver'in window))return;
  io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){document.querySelectorAll('#chips a').forEach(function(a){a.classList.toggle('on','#c-'+a.dataset.c===('#'+e.target.id))});var on=document.querySelector('#chips a.on');if(on){var box=$('#chips');var l=on.offsetLeft-box.clientWidth/2+on.clientWidth/2;box.scrollTo({left:l,behavior:'smooth'})}}})},{rootMargin:'-140px 0px -70% 0px'});
  document.querySelectorAll('.cat').forEach(function(s){io.observe(s)});
}
if($('#sort'))$('#sort').addEventListener('change',function(e){sortMode=e.target.value;renderMenu()});
if($('#q'))$('#q').addEventListener('input',function(e){q=e.target.value.trim().toLowerCase();renderMenu()});
if($('#menu'))$('#menu').addEventListener('click',function(e){var vp=e.target.closest('.vp');if(vp){var card=vp.closest('.pcard');card.querySelectorAll('.vp').forEach(function(x){var on=x===vp;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});var ab=card.querySelector('.add');ab.dataset.v=vp.dataset.v;card.querySelector('.pprice').textContent=vp.dataset.p;return}var b=e.target.closest('.add');if(!b)return;addItem(b.dataset.id,+b.dataset.v);b.classList.remove('flash');void b.offsetWidth;b.classList.add('flash')});

/* ===== winkelmand ===== */
var cart=[];
try{cart=JSON.parse(localStorage.getItem('bassma-cart')||'[]')}catch(e){cart=[]}
cart=cart.filter(function(l){try{find(l.id);return true}catch(e){return false}});
function save(){try{localStorage.setItem('bassma-cart',JSON.stringify(cart))}catch(e){}}
function priceOf(l){var f=find(l.id);return l.v&&f.it[2]?f.it[2]:f.it[1]}
function count(){return cart.reduce(function(a,l){return a+l.q},0)}
function sum(){return cart.reduce(function(a,l){return a+priceOf(l)*l.q},0)}
function addItem(id,v){
  var l=cart.filter(function(x){return x.id===id&&x.v===v})[0];
  if(l)l.q++;else cart.push({id:id,v:v,q:1});
  save();upd();toast(t('added')+': '+nm(find(id).it[0]));
}
function toast(m){var e=$('#toast');e.textContent=m;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(function(){e.classList.remove('on')},1400)}
function upd(){
  markCart();var n=count();
  $('#cnt').textContent=n;$('#mcnt').textContent=n;$('#mtot').textContent=eur(sum());
  $('#mbar').classList.toggle('on',n>0);document.body.classList.toggle('hasc',n>0);
  if($('#cart').classList.contains('on')&&view==='list')showList();
}
var view='list';
function open(){$('#cart').classList.add('on');$('#ov').classList.add('on');$('#cart').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';showList()}
function closeC(){$('#cart').classList.remove('on');$('#ov').classList.remove('on');$('#cart').setAttribute('aria-hidden','true');document.body.style.overflow=''}
$('#openCart').onclick=open;$('#mbar').onclick=open;$('#closeCart').onclick=closeC;$('#ov').onclick=closeC;
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeC()});

function showList(){
  view='list';$('#ctitle').textContent=t('your');
  var h='<div class="cb">';
  if(!cart.length)h+='<p class="empty">'+t('empty')+'</p>';
  cart.forEach(function(l,i){
    var f=find(l.id),p=priceOf(l);
    h+='<div class="line"><div><div class="nm">'+nm(f.it[0])+'</div><div class="vr">'+nm(f.cat.n)+(l.v?' · '+t('menu'):'')+'</div></div><div class="pr">'+eur(p*l.q)+'</div><div class="qty"><button data-a="m" data-i="'+i+'" aria-label="-">−</button><span>'+l.q+'</span><button data-a="p" data-i="'+i+'" aria-label="+">+</button><button class="rm" data-a="r" data-i="'+i+'">'+t('remove')+'</button></div></div>';
  });
  h+='</div><div class="cf"><div class="tot"><span>'+t('sub')+'</span><span>'+eur(sum())+'</span></div>';
  if(cart.length&&sum()<CFG.DELIVERY.freeFrom)h+='<p class="hint">'+t('freehint',{x:eur(CFG.DELIVERY.freeFrom-sum())})+'</p>';
  if(CFG.MIN_ORDER&&sum()<CFG.MIN_ORDER)h+='<p class="warn">'+t('min',{m:eur(CFG.MIN_ORDER)})+'</p>';
  h+='<button class="btn" id="go"'+(!cart.length||(CFG.MIN_ORDER&&sum()<CFG.MIN_ORDER)?' disabled style="opacity:.5"':'')+'>'+t('checkout')+'</button></div>';
  $('#cview').innerHTML=h;
}
$('#cview').addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;
  if(b.id==='go'){showForm();return}
  if(b.id==='back'){showList();return}
  if(b.id==='cl'){closeC();return}
  var a=b.dataset.a,i=+b.dataset.i;if(!a)return;
  if(a==='p')cart[i].q++;else if(a==='m'){cart[i].q--;if(cart[i].q<1)cart.splice(i,1)}else cart.splice(i,1);
  save();upd();showList();
});

/* ===== verbinding met de server (menu, tijden en instellingen komen dan uit het beheerpaneel) ===== */
var SERVER=false;
function applyServer(c){
  SERVER=true;CFG.SHOP=c.shop;CFG.HOURS=c.hours;CFG.EXC=c.exceptions||{};CFG.ETA=c.eta;CFG.MIN_ORDER=c.minOrder;CFG.CASH=c.cashPickup;CFG.DELIVERY=c.delivery;CFG.DAYS=c.daysAhead;CFG.PAY=c.payment;CFG.TODAY=c.today;MENU=c.menu;
}
function loadServer(){
  if(!/^https?:/.test(location.protocol))return Promise.resolve();
  return fetch('/api/config',{cache:'no-store'}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(applyServer).catch(function(){});
}
function maxKm(){var z=CFG.DELIVERY.zones;return z[z.length-1].maxKm}
function zoneFor(km){var z=CFG.DELIVERY.zones;for(var i=0;i<z.length;i++)if(km<=z[i].maxKm)return z[i];return null}
function pad2(n){return String(n).padStart(2,'0')}
function amsDate(){var p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return p}
function addD(ds,n){var d=new Date(ds+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function dowOf(ds){return new Date(ds+'T12:00:00Z').getUTCDay()}
function hoursFor(ds){var h=(ds in CFG.EXC)?CFG.EXC[ds]:CFG.HOURS[dowOf(ds)];return h?{o:h[0]*60+h[1],c:h[2]*60+h[3],os:fmtT([h[0],h[1]]),cs:fmtT([h[2],h[3]])}:null}

/* ===== bezorgkosten en verwachte tijd ===== */
function kmBetween(a,b,c,d){var R=6371,r=Math.PI/180,x=(c-a)*r,y=(d-b)*r,s=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)*Math.sin(y/2);return 2*R*Math.asin(Math.sqrt(s))}
function quoteFor(dist,subtotal){
  var z=zoneFor(dist);if(!z)return{ok:false,err:'far'};
  var E=CFG.ETA,kr=Math.ceil(dist)*E.minPerKm;
  return{ok:true,km:dist,fee:subtotal>=CFG.DELIVERY.freeFrom?0:z.fee,min:E.prepMin+kr,max:E.prepMax+kr};
}
function quoteAddress(ad,subtotal){
  var q=encodeURIComponent(ad.street+' '+ad.zip+' '+ad.city);
  return fetch('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fq=type:adres&fl=woonplaatsnaam,centroide_ll,weergavenaam&q='+q).then(function(r){return r.json()}).then(function(j){
    var d=j.response&&j.response.docs&&j.response.docs[0],m=d&&/POINT\(([-\d.]+) ([-\d.]+)\)/.exec(d.centroide_ll||'');
    if(!m)return{ok:false,err:'noaddr'};
    return quoteFor(kmBetween(CFG.SHOP.lat,CFG.SHOP.lon,+m[2],+m[1]),subtotal);
  }).catch(function(){return{ok:false,err:'net'}});
}
/* Alleen voor de voorbeeldpagina (zonder server): schatting als het adres niet kan worden opgezocht */
function estimateQuote(ad,subtotal){return quoteFor(ad.city.trim().toLowerCase()===CFG.DELIVERY.city.toLowerCase()?3:10,subtotal)}
function etaText(type,q){
  if(type==='delivery'&&q&&q.ok)return t('eta_del',{a:q.min,b:q.max});
  return t('eta_pick',{a:CFG.ETA.prepMin,b:CFG.ETA.prepMax});
}
function infoDelText(){var z=CFG.DELIVERY.zones,f=z[0].fee,k=maxKm();
  return CFG.DELIVERY.enabled?t('info_del2',{fee:String(f).replace('.',','),km:String(k).replace('.',','),free:CFG.DELIVERY.freeFrom}):t('delivery_off')}

/* ===== afrekenen ===== */
var NOSLOT=false,Q={ok:false,loading:false,err:''},qSeq=0,qTimer=0,lastInfo=null;

function dateLabel(ds){
  var today=SERVER&&CFG.TODAY?CFG.TODAY:amsDate();
  if(ds===today)return t('today');if(ds===addD(today,1))return t('tomorrow');
  var loc={nl:'nl-NL',en:'en-GB',tr:'tr-TR',ar:'ar'}[lang]||'nl-NL';
  return new Intl.DateTimeFormat(loc,{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(ds+'T12:00:00Z'));
}
function dateOptions(){
  var today=SERVER&&CFG.TODAY?CFG.TODAY:amsDate(),o=[];
  for(var i=0;i<=CFG.DAYS;i++){var ds=addD(today,i),open=!!hoursFor(ds);o.push('<option value="'+ds+'"'+(open?'':' disabled')+'>'+dateLabel(ds)+(open?'':' ('+t('closed_day')+')')+'</option>')}
  return o.join('');
}
/* Tijden voor de gekozen dag: met de server komen ze (met beschikbaarheid) van /api/slots, zonder server worden ze hier berekend */
function loadSlots(f){
  var date=f.date.value,type=f.ot.value,sel=f.time,msg=$('#slotmsg');
  function fill(list){
    var first=-1;sel.innerHTML=list.map(function(s,i){if(s.available&&first<0)first=i;return '<option value="'+s.time+'"'+(s.available?'':' disabled')+'>'+s.time+(s.available?'':' ('+(s.reason==='vol'?t('full'):t('closed_day'))+')')+'</option>'}).join('');
    NOSLOT=first<0;if(first>=0)sel.selectedIndex=first;msg.textContent=NOSLOT?t('slot_none'):'';msg.className='hint'+(NOSLOT?' bad':'');
  }
  if(SERVER){
    sel.innerHTML='<option>…</option>';
    fetch('/api/slots?date='+date+'&type='+type,{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){if(f.date.value===date)fill(j.slots||[])}).catch(function(){fill([])});
    return;
  }
  var H=hoursFor(date),n=nowAms(),today=amsDate(),step=15,lead=type==='delivery'?30:15,list=[];
  if(H){var m=Math.ceil(Math.max(H.o,date===today?n.h*60+n.m+lead:0)/step)*step;for(;m<=H.c-step;m+=step)list.push({time:pad2(Math.floor(m/60))+':'+pad2(m%60),available:true})}
  fill(list);
}
function payOptions(d){
  var h='',online=SERVER?(CFG.PAY&&CFG.PAY.available?CFG.PAY.methods:[]):[{id:'ideal',label:'iDEAL'},{id:'bancontact',label:'Bancontact'},{id:'creditcard',label:'Creditcard'}];
  online.forEach(function(m,i){h+='<label><input type="radio" name="pm" value="'+m.id+'"'+(i===0?' checked':'')+'>'+m.label+'</label>'});
  if(CFG.CASH&&!d)h+='<label id="cashl"><input type="radio" name="pm" value="cash"'+(online.length?'':' checked')+'>'+t('cash')+'</label>';
  return h||'<p class="hint bad">'+t('pay_off')+'</p>';
}
function hash(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)}
function idemKey(fp){
  var k='';try{k=sessionStorage.getItem('bidem')||''}catch(e){}
  if(!k){k=(window.crypto&&crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)+Date.now());try{sessionStorage.setItem('bidem',k)}catch(e){}}
  return k+'-'+hash(fp);
}
function showForm(){
  view='form';$('#ctitle').textContent=t('checkout');Q={ok:false,loading:false,err:''};
  var rows=cart.map(function(l){var f=find(l.id);return '<div><span>'+l.q+'× '+nm(f.it[0])+(l.v?' ('+t('menu')+')':'')+'</span><span>'+eur(priceOf(l)*l.q)+'</span></div>'}).join('');
  $('#cview').innerHTML='<form id="f" class="cb" novalidate>'+
  '<div class="seg" role="radiogroup"><label><input type="radio" name="ot" value="pickup" checked>'+t('pickup')+'</label>'+(CFG.DELIVERY.enabled?'<label><input type="radio" name="ot" value="delivery">'+t('delivery')+'</label>':'<label style="opacity:.45"><input type="radio" name="ot" value="delivery" disabled>'+t('delivery')+'</label>')+'</div>'+
  (CFG.DELIVERY.enabled?'':'<p class="hint bad">'+t('delivery_off')+'</p>')+
  '<label for="fn">'+t('name')+'</label><input id="fn" name="name" autocomplete="name" required>'+
  '<label for="fp">'+t('phone')+'</label><input id="fp" name="phone" type="tel" inputmode="tel" autocomplete="tel" required>'+
  '<label for="fe">'+t('email')+'</label><input id="fe" name="email" type="email" inputmode="email" autocomplete="email" required>'+
  '<div id="addr" hidden><label for="fs">'+t('street')+'</label><input id="fs" name="street" autocomplete="street-address"><label for="fz">'+t('postcode')+'</label><input id="fz" name="zip" autocomplete="postal-code"><label for="fc">'+t('city')+'</label><input id="fc" name="city" value="Gorinchem" autocomplete="address-level2"><div id="qmsg" class="hint"></div></div>'+
  '<label for="fd">'+t('date')+'</label><select id="fd" name="date">'+dateOptions()+'</select>'+
  '<label for="ft">'+t('time')+'</label><select id="ft" name="time"></select><div id="slotmsg" class="hint"></div>'+
  '<label for="fo">'+t('note')+'</label><textarea id="fo" name="note"></textarea>'+
  '<label>'+t('paywith')+'</label><div class="pay" id="pays">'+payOptions(false)+'</div>'+
  '<div class="sum">'+rows+'<div id="feeRow" hidden><span id="feeL"></span><span id="feeV"></span></div><div style="font-weight:700;margin-top:6px"><span>'+t('total')+'</span><span id="gt">'+eur(sum())+'</span></div><div id="etaRow" class="eta"></div></div>'+
  '<p class="hint">'+t('privacy')+' <a href="/privacy" target="_blank" rel="noopener" style="color:var(--brown)">'+t('privacy_l')+'</a></p>'+
  '</form><div class="cf"><button class="btn" id="pay" type="submit" form="f">'+t('pay')+' · <span id="pt">'+eur(sum())+'</span></button><button class="btn ghost" id="back" type="button" style="margin-top:8px">'+t('back')+'</button></div>';
  var f=$('#f');
  var fd=f.date;for(var i=0;i<fd.options.length;i++)if(!fd.options[i].disabled){fd.selectedIndex=i;break}
  var lastType='pickup';
  function sync(){
    var d=f.ot.value==='delivery',fee=d&&Q.ok?Q.fee:0,tot=sum()+fee;
    $('#addr').hidden=!d;
    if(lastType!==f.ot.value){lastType=f.ot.value;var keep=f.pm&&f.pm.value;$('#pays').innerHTML=payOptions(d);if(keep&&f.pm){try{f.pm.value=keep}catch(e){}}}
    var fr=$('#feeRow');fr.hidden=!(d&&Q.ok);
    if(d&&Q.ok){$('#feeL').textContent=Q.fee===0?t('fee_free'):t('fee_out',{km:Q.km.toFixed(1)});$('#feeV').textContent=Q.fee===0?eur(0):eur(Q.fee)}
    var qm=$('#qmsg');qm.className='hint'+(Q.err?' bad':'');
    qm.textContent=!d?'':(Q.loading?t('calc'):(Q.err?t('q_'+Q.err,{m:maxKm()}):(Q.ok?'':t('fill_addr'))));
    $('#etaRow').textContent=etaText(f.ot.value,Q);
    $('#gt').textContent=eur(tot);$('#pt').textContent=eur(tot);
    $('#pay').disabled=(d&&!Q.ok)||!f.pm||NOSLOT;
  }
  function requote(){
    clearTimeout(qTimer);var ad={street:f.street.value.trim(),zip:f.zip.value.trim(),city:f.city.value.trim()};
    Q={ok:false,loading:false,err:''};
    if(f.ot.value!=='delivery'||ad.street.length<3||ad.zip.length<6||!ad.city){sync();return}
    Q.loading=true;sync();var my=++qSeq;
    qTimer=setTimeout(function(){quoteAddress(ad,sum()).then(function(r){if(my!==qSeq)return;if(r.err==='net'&&!SERVER)r=estimateQuote(ad,sum());Q=r;sync()})},500);
  }
  f.addEventListener('change',function(e){
    if(e.target.name==='ot'){loadSlots(f);requote()}
    else if(e.target.name==='date'){loadSlots(f);sync()}
    else sync();
  });
  ['street','zip','city'].forEach(function(n){f.elements[n].addEventListener('input',requote)});
  loadSlots(f);setTimeout(sync,0);sync();
  var slotWatch=setInterval(function(){if(!document.getElementById('f')){clearInterval(slotWatch);return}sync()},700);
  f.addEventListener('submit',function(e){e.preventDefault();submit(f)});
}
function submit(f){
  f.querySelectorAll('.err').forEach(function(x){x.remove()});
  if(NOSLOT){toast(t('slot_none'));return}
  var d=f.ot.value==='delivery',need=['name','phone','email'].concat(d?['street','zip','city']:[]),bad=null;
  need.forEach(function(n){var el=f.elements[n],v=el.value.trim(),ok=!!v;if(n==='email')ok=/^\S+@\S+\.\S+$/.test(v);if(!ok){var m=document.createElement('div');m.className='err';m.textContent=t('req');el.after(m);bad=bad||el}});
  if(bad){bad.focus();return}
  if(d&&!Q.ok){toast(t('q_'+(Q.err||'noaddr'),{m:maxKm()}));return}
  var pm=f.pm.value;
  var order={type:f.ot.value,customer:{name:f.name.value.trim(),phone:f.phone.value.trim(),email:f.email.value.trim()},address:d?{street:f.street.value.trim(),zip:f.zip.value.trim(),city:f.city.value.trim()}:null,
    slot:{date:f.date.value,time:f.time.value},note:f.note.value.trim(),payment:pm==='cash'?'cash':'online',method:pm,
    items:cart.map(function(l){return{id:l.id,qty:l.q,menu:!!l.v}})};
  lastInfo={type:order.type,email:order.customer.email,eta:etaText(order.type,Q),slot:order.slot.time};
  var btn=$('#pay');btn.disabled=true;
  if(SERVER){
    btn.textContent=t('redir');
    fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idemKey(JSON.stringify(order))},body:JSON.stringify(order)})
      .then(function(r){return r.json().then(function(j){if(!r.ok)throw{status:r.status,msg:j.error};return j})})
      .then(function(j){
        if(j.checkoutUrl){location.href=j.checkoutUrl;return}   /* winkelmandje blijft bewaard tot de betaling is gelukt */
        try{sessionStorage.removeItem('bidem')}catch(e){}
        done(j.orderNumber||'',true,j.token);
      })
      .catch(function(e){btn.disabled=false;btn.textContent=t('pay');if(e&&e.status===409)loadSlots(f);toast(e&&e.msg?e.msg:t('fail'))});
  }else{done('',false)}
}
function done(num,real,token){
  var n=num||('BAS-'+Math.floor(1000+Math.random()*9000)),i=lastInfo||{};
  cart=[];save();upd();view='done';$('#ctitle').textContent=t('thanks');
  $('#cview').innerHTML='<div class="cb"><div class="done"><h2>'+t('thanks')+'</h2><p>'+t('order')+': <b>'+n+'</b></p>'+(i.slot?'<p class="etab">'+t('slot_chosen',{s:i.slot})+'</p>':'')+'<p>'+(real?t('mail_sent',{e:i.email||''}):t('demo'))+'</p>'+(token?'<p><a href="/bedankt.html?o='+token+'" style="color:var(--brown);font-weight:700">'+t('track')+'</a></p>':'')+'</div></div><div class="cf"><button class="btn" id="cl">'+t('close')+'</button></div>';
}
/* ===== open / gesloten ===== */
function nowAms(){var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()),o={};p.forEach(function(x){o[x.type]=x.value});return{d:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(o.weekday),h:+o.hour%24,m:+o.minute}}
function hrs(d){var h=CFG.HOURS[d];return h?{o:h[0]*60+h[1],c:h[2]*60+h[3],os:fmtT([h[0],h[1]]),cs:fmtT([h[2],h[3]])}:{o:0,c:0,os:'–',cs:'–'}}
function status(){
  var e=$('#st');if(!e)return;var n=nowAms(),m=n.h*60+n.m,today=amsDate(),H=hoursFor(today),i,tm;
  if(H&&m>=H.o&&m<H.c){i=0;tm=H.cs}else if(H&&m<H.o){i=1;tm=H.os}
  else{i=2;tm='';for(var k=1;k<=7&&!tm;k++){var N=hoursFor(addD(today,k));if(N)tm=N.os}}
  e.className='status'+(i?' closed':'');
  e.querySelector('span').textContent=t(['open','closed1','closed2'][i],{t:tm});
}setInterval(status,60000);
/* ===== gerechten in de hero: schuiven vanzelf, midden het grootst ===== */
/* Foto's: zet transparante PNG's als images/gerechten/gerecht-1.png ... gerecht-3.png (transparante achtergrond) */
var SHOW=[1,2,3],stage=document.getElementById('track'),cur=1,showTimer=0;
function renderShow(){
  if(!stage)return;
  var h='';
  SHOW.forEach(function(n){
    h+='<div class="slide"><div class="cut"><div class="plate"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>'+t('soon')+'</span></div><img src="images/gerechten/gerecht-'+n+'.png" alt="" draggable="false" onload="this.parentNode.classList.add(\'has\')" onerror="this.remove()"></div></div>';
  });
  stage.innerHTML=h;layoutShow();
}
function layoutShow(){if(!stage)return;var W=stage.clientWidth;stage.style.height=Math.round(W*0.5)+'px';placeShow()}
function placeShow(){
  if(!stage.clientWidth){requestAnimationFrame(layoutShow);return}
  var n=SHOW.length,W=stage.clientWidth,w=Math.round(W*0.42),step=w*0.8,half=Math.floor(n/2);
  stage.querySelectorAll('.slide').forEach(function(s,i){
    var off=((i-cur+n+half)%n)-half,a=Math.abs(off),sc=a===0?1:(a===1?0.62:0.4);
    if(s._off!==undefined&&Math.abs(off-s._off)>1){s.style.transition='none';void s.offsetWidth;requestAnimationFrame(function(){s.style.transition=''})}
    s._off=off;
    s.style.width=w+'px';
    s.style.transform='translateX(calc(-50% + '+Math.round(off*step)+'px)) scale('+sc+')';
    s.style.opacity=a>1?0:(a===1?0.92:1);
    s.style.zIndex=10-a;
  });
}
function startShow(){
  clearInterval(showTimer);
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  showTimer=setInterval(function(){if(document.hidden)return;cur=(cur+1)%SHOW.length;placeShow()},3200);
}
window.addEventListener('resize',layoutShow);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(layoutShow);
startShow();
/* ===== taal ===== */
function setLang(l){
  lang=l;try{localStorage.setItem('bassma-lang',l)}catch(e){}document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr';
  document.querySelectorAll('[data-t]').forEach(function(e){e.textContent=t(e.dataset.t)});
  document.querySelectorAll('[data-ip]').forEach(function(e){e.placeholder=t(e.dataset.ip)});
  document.querySelectorAll('.langs button,.mlang button,.lpm button').forEach(function(b){b.classList.toggle('on',b.dataset.l===l)});lpb.innerHTML=FL[l];
  var hw=hrs(1),hs=hrs(0);if($('#infoDel'))$('#infoDel').textContent=infoDelText();if($('#hoursTxt'))$('#hoursTxt').innerHTML=t('hw')+': '+hw.os+' – '+hw.cs+'<br>'+t('hs')+': '+hs.os+' – '+hs.cs;
  status();renderMenu();renderHome();renderShow();upd();
  if($('#cart').classList.contains('on')){if(view==='list')showList();else if(view==='form')showForm()}
}
var savedLang='nl';try{savedLang=localStorage.getItem('bassma-lang')||'nl'}catch(e){}
if(!T[savedLang])savedLang='nl';
setLang((/[?&]lang=(en|tr|ar)/.exec(location.search)||[0,savedLang])[1]);
function toHash(){if(location.hash.length>1){var el=document.querySelector(location.hash);if(el)setTimeout(function(){el.scrollIntoView()},50)}}toHash();
loadServer().then(function(){cart=cart.filter(function(l){try{find(l.id);return true}catch(e){return false}});save();setLang(lang);toHash()});

/* ===== zachte verschijn-animatie bij het scrollen (veilig: na 2,5 s is alles zichtbaar) ===== */
(function(){
  var els=document.querySelectorAll('.sech,.tile,.pc,.stp li,.story .txt,.sarch,.vrow,.vroute,.cta .wrap>*,.pagehead .wrap>*');
  if(!('IntersectionObserver' in window)||!els.length)return;
  document.documentElement.classList.add('js');
  els.forEach(function(e,i){e.classList.add('rv');e.style.transitionDelay=((i%6)*50)+'ms'});
  var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{rootMargin:'0px 0px -8% 0px'});
  els.forEach(function(e){io.observe(e)});
  setTimeout(function(){els.forEach(function(e){e.classList.add('in')})},2500);
})();