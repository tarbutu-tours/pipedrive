// Enrich comparison_by_destination.json with full competitor data
// Run from project root: node competitor_research/enrich_competitors.cjs
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname);
const filePath = path.join(BASE, 'comparison_by_destination.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const dest = data.destinations;

// פיורדים – add cruise.co.il + kishrey-teufa
dest['פיורדים'].competitors = [
  { company: 'קרוזתור', name: 'קרוז לפיורדים הנורבגיים (עם לונדון)', days: 'באתר', price: 'באתר', date: '—', note: 'מדריך עברית, סיורי חוף כלולים' },
  { company: 'קרוזתור', name: 'שייט מאורגן לפיורדים – תאריכים לפי חודש', days: 'באתר', price: 'באתר', date: 'פברואר–נובמבר 2026' },
  { company: 'קשרי תעופה', name: 'שייט מאורגן לפיורדים הנורבגיים', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'גולדן טורס', name: 'קרוזים כשרים לפיורדים', days: 'באתר', price: 'באתר', date: '—' },
];

// דנובה
dest['דנובה'].competitors = [
  { company: 'קרוזתור', name: 'שייט בנהר הדנובה עם משה דץ והזמרת שרי', days: 9, price: 'באתר', date: '—', note: 'מבודפשט לפסאו, סיורי חוף כלולים' },
  { company: 'קרוזתור', name: 'שייט בנהר המיין ויובליו – הריין, בוואריה והדנובה', days: 9, price: 'באתר', date: '—', note: 'עם להקת הגבעטרון ומשה דץ' },
  { company: 'קרוזתור', name: 'שייט מאורגן על הדנובה – תאריכים לפי חודש', days: 9, price: 'באתר', date: 'פברואר–ינואר 2027' },
  { company: 'גולדן טורס', name: 'קרוזים כשרים לדנובה', days: 'באתר', price: 'באתר', date: '—' },
];

// דואורו
dest['דואורו'].competitors = [
  { company: 'קרוזתור', name: 'שייט בנהר הדואורו בפורטוגל', days: 'באתר', price: 'באתר', date: '—', note: 'סיורי חוף כלולים, מדריך עברית' },
  { company: 'קשרי תעופה', name: 'שייט נהרות בפורטוגל (דואורו)', days: 'באתר', price: 'באתר', date: '—' },
];

// ים תיכון
dest['ים תיכון'].competitors = [
  { company: 'קרוזתור', name: 'קרוז מאורגן למערב הים התיכון ואגמי צפון איטליה', days: 11, price: 'באתר', date: '—', note: 'גנואה, סיציליה, מלטה, ברצלונה, אקס אן פרובנס, מילאנו' },
  { company: 'קרוזתור', name: 'קרוז בים התיכון – אזור הים התיכון', days: 'באתר', price: 'באתר', date: '—', note: 'סיורי חוף כלולים' },
  { company: 'קשרי תעופה', name: 'שייט מאורגן בצפון מערב אירופה', days: 10, price: '$4,595', date: '28/05/26', note: 'פנסיון מלא, Celebrity Apex' },
  { company: 'קשרי תעופה', name: 'שייט רביירות ים תיכון', days: 9, price: '$3,695', date: '31/07/26', note: 'MSC Seaview' },
  { company: 'קשרי תעופה', name: 'שייט רביירות מערב אירופה', days: 7, price: '$3,499', date: '16/08/26' },
  { company: 'קשרי תעופה', name: 'שייט ריביירות מערב אירופה סוכות', days: 7, price: '$3,595', date: '27/09/26' },
  { company: 'מנו ספנות', name: 'קרוזים לים התיכון (הפלגה מחיפה)', days: 'באתר', price: 'באתר', date: '—', note: 'סיורי חוף, כשר' },
];

// אלסקה
dest['אלסקה'].competitors = [
  { company: 'קרוזתור', name: 'קרוז לאלסקה וטיול להרי הרוקי הקנדיים', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'קרוזתור', name: 'קרוז לאלסקה והרי הרוקי', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'קשרי תעופה', name: 'שייט מאורגן לאלסקה', days: 'באתר', price: 'באתר', date: '—' },
];

// שייט נהרות
dest['שייט נהרות – רון, סיין, דורדון, ריין'].competitors = [
  { company: 'קרוזתור', name: 'שייט בנהר המיין ויובליו – הריין, בוואריה והדנובה', days: 9, price: 'באתר', date: '—', note: 'עם להקת הגבעטרון ומשה דץ' },
  { company: 'קרוזתור', name: 'שייט בנהר הסיין בצרפת', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'קרוזתור', name: 'שייט בנהרות הרון והסון בצרפת', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'קרוזתור', name: 'שייט על הריין ועל המוזל', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'קרוזתור', name: 'שייט נהרות בצרפת (סיין, רון, דורדון)', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'קרוזתור', name: 'שייט נהרות בהולנד ובלגיה', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'גולדן טורס', name: 'קרוזים כשרים לריין, דנובה', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'קשרי תעופה', name: 'שייט מאורגן ריביירות (ים תיכון/מערב אירופה)', days: '7–10', price: '$3,499–$4,595', date: '2026' },
];

// ים בלטי
dest['ים בלטי'].competitors = [
  { company: 'קרוזתור', name: 'שייט מאורגן לים הבלטי', days: 'באתר', price: 'באתר', date: '—', note: 'מאמרים והמלצות באתר' },
  { company: 'קשרי תעופה', name: 'שייט מאורגן לים הבלטי', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'קשרי תעופה', name: 'שייט מאוסטרלנד / שטוקהולם', days: 'באתר', price: 'באתר', date: '—' },
];

// מזרח הרחוק
dest['מזרח הרחוק'].competitors = [
  { company: 'קרוזתור', name: 'ויטנאם וקמבודיה כולל שייט על המקונג', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'קרוזתור', name: 'קרוז לסינגפור, ויטנאם, הונג קונג, טאיוואן ויפן', days: 20, price: 'באתר', date: 'פברואר 2027' },
  { company: 'קרוזתור', name: 'שייט ליפן, טאיוואן, הפיליפינים והונג קונג', days: 18, price: 'באתר', date: '21/11/25' },
  { company: 'קרוזתור', name: 'שייט למזרח הרחוק – אזור אסיה', days: 'באתר', price: 'באתר', date: '—' },
  { company: 'קרוזתור', name: 'שייט להונג קונג, הפיליפינים, טאיוואן ויפן', days: 21, price: 'באתר', date: 'פברואר 2026' },
  { company: 'קשרי תעופה', name: 'שייט למזרח הרחוק', days: 'באתר', price: 'באתר', date: '—' },
];

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
console.log('Updated comparison_by_destination.json with full competitor data.');
