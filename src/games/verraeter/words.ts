export interface Word {
  word: string;
  cat: string;
  pair: string;
  decoys: readonly string[];
  wg?: true;
}

interface Group {
  cat: string;
  items: readonly string[];
  wg?: true;
}

const GROUPS: readonly Group[] = [
  { cat: 'Tiere', items: ['Hund', 'Wolf', 'Fuchs', 'Katze', 'Löwe', 'Tiger', 'Pferd', 'Esel', 'Kuh', 'Ziege'] },
  { cat: 'Vögel', items: ['Spatz', 'Meise', 'Taube', 'Rabe', 'Krähe', 'Adler', 'Falke', 'Eule', 'Papagei', 'Pinguin'] },
  { cat: 'Meerestiere', items: ['Hai', 'Delfin', 'Wal', 'Robbe', 'Krabbe', 'Qualle', 'Seestern', 'Tintenfisch', 'Hummer', 'Forelle'] },
  { cat: 'Obst', items: ['Apfel', 'Birne', 'Banane', 'Orange', 'Zitrone', 'Kirsche', 'Erdbeere', 'Traube', 'Pfirsich', 'Mango'] },
  { cat: 'Gemüse', items: ['Karotte', 'Gurke', 'Tomate', 'Paprika', 'Zwiebel', 'Brokkoli', 'Spinat', 'Kohl', 'Erbse', 'Lauch'] },
  { cat: 'Essen', items: ['Pizza', 'Nudeln', 'Pommes', 'Burger', 'Döner', 'Salat', 'Suppe', 'Pfannkuchen', 'Brezel', 'Kartoffel'] },
  { cat: 'Süßes', items: ['Schokolade', 'Gummibärchen', 'Keks', 'Kuchen', 'Eis', 'Bonbon', 'Lakritz', 'Waffel', 'Pudding', 'Marzipan'] },
  { cat: 'Getränke', items: ['Wasser', 'Saft', 'Tee', 'Kaffee', 'Limo', 'Milch', 'Kakao', 'Cola', 'Eistee', 'Sprudel'] },
  { cat: 'Gewürze', items: ['Salz', 'Pfeffer', 'Zucker', 'Zimt', 'Paprikapulver', 'Oregano', 'Basilikum', 'Curry', 'Vanille', 'Knoblauch'] },
  {
    cat: 'Küche',
    wg: true,
    items: ['Herd', 'Backofen', 'Toaster', 'Mixer', 'Wasserkocher', 'Pfanne', 'Topf', 'Messer', 'Löffel', 'Gabel'],
  },
  {
    cat: 'Bad',
    wg: true,
    items: ['Dusche', 'Badewanne', 'Waschbecken', 'Spiegel', 'Zahnbürste', 'Handtuch', 'Seife', 'Föhn', 'Shampoo', 'Klobürste'],
  },
  {
    cat: 'Wohnzimmer',
    wg: true,
    items: ['Sofa', 'Sessel', 'Teppich', 'Vorhang', 'Fernseher', 'Regal', 'Couchtisch', 'Stehlampe', 'Kissen', 'Decke'],
  },
  {
    cat: 'Putzen',
    wg: true,
    items: ['Besen', 'Staubsauger', 'Wischmopp', 'Eimer', 'Schwamm', 'Putzlappen', 'Spülmittel', 'Müllbeutel', 'Handfeger', 'Abfalleimer'],
  },
  {
    cat: 'Haushaltsgeräte',
    wg: true,
    items: ['Waschmaschine', 'Trockner', 'Bügeleisen', 'Kühlschrank', 'Mikrowelle', 'Geschirrspüler', 'Kaffeemaschine', 'Gefrierschrank', 'Wäscheständer', 'Heizung'],
  },
  {
    cat: 'Schlafzimmer',
    wg: true,
    items: ['Bett', 'Matratze', 'Lattenrost', 'Nachttisch', 'Kleiderschrank', 'Wecker', 'Bettdecke', 'Schlafsack', 'Hängematte', 'Pyjama'],
  },
  { cat: 'Sport', items: ['Fußball', 'Basketball', 'Handball', 'Volleyball', 'Tennis', 'Tischtennis', 'Badminton', 'Golf', 'Schwimmen', 'Joggen'] },
  { cat: 'Berufe', items: ['Bäcker', 'Metzger', 'Tischler', 'Maler', 'Elektriker', 'Klempner', 'Gärtner', 'Koch', 'Kellner', 'Friseur'] },
  { cat: 'Fahrzeuge', items: ['Auto', 'Bus', 'Bahn', 'Straßenbahn', 'Fahrrad', 'Roller', 'Motorrad', 'Traktor', 'Schiff', 'Flugzeug'] },
  { cat: 'Kleidung', items: ['Hose', 'Jeans', 'Rock', 'Kleid', 'Pullover', 'Jacke', 'Mantel', 'Schal', 'Mütze', 'Socken'] },
  { cat: 'Instrumente', items: ['Gitarre', 'Geige', 'Cello', 'Klavier', 'Flöte', 'Trompete', 'Schlagzeug', 'Harfe', 'Saxofon', 'Akkordeon'] },
  { cat: 'Werkzeug', items: ['Hammer', 'Zange', 'Säge', 'Bohrer', 'Schraubenzieher', 'Feile', 'Meißel', 'Wasserwaage', 'Schraubstock', 'Hobel'] },
  { cat: 'Schule', items: ['Heft', 'Stift', 'Lineal', 'Radiergummi', 'Tafel', 'Schulranzen', 'Zirkel', 'Taschenrechner', 'Federmappe', 'Pausenbrot'] },
  { cat: 'Orte', items: ['Strand', 'Wald', 'Berg', 'See', 'Wiese', 'Park', 'Zoo', 'Museum', 'Bahnhof', 'Flughafen'] },
  { cat: 'Wetter', items: ['Regen', 'Schnee', 'Gewitter', 'Nebel', 'Hagel', 'Wind', 'Sturm', 'Sonne', 'Wolke', 'Regenbogen'] },
  { cat: 'Technik', items: ['Handy', 'Laptop', 'Tablet', 'Kamera', 'Kopfhörer', 'Lautsprecher', 'Drucker', 'Router', 'Ladekabel', 'Powerbank'] },
  { cat: 'Spiele', items: ['Schach', 'Monopoly', 'Puzzle', 'Karten', 'Würfel', 'Domino', 'Mikado', 'Quiz', 'Skat', 'Memory'] },
  { cat: 'Garten', items: ['Rasen', 'Hecke', 'Beet', 'Gießkanne', 'Schaufel', 'Rechen', 'Gartenzwerg', 'Grill', 'Schubkarre', 'Liegestuhl'] },
];

const OFFSETS = [2, 3, 4, 5, 6] as const;

export const WORDS: readonly Word[] = GROUPS.flatMap((g) => {
  const at = (i: number): string => g.items[i % g.items.length] as string;
  return g.items.map((word, i) => ({
    word,
    cat: g.cat,
    pair: at(i + 1),
    decoys: OFFSETS.map((d) => at(i + d)),
    ...(g.wg ? { wg: true as const } : {}),
  }));
});
