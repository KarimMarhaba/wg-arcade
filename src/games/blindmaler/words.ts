export interface Word {
  word: string;
  cat: string;
}

const GROUPS: readonly (readonly [cat: string, words: readonly string[]])[] = [
  ['Tiere', ['Katze', 'Fisch', 'Elefant', 'Giraffe', 'Schlange', 'Schnecke', 'Spinne', 'Pinguin', 'Schildkröte', 'Ente']],
  ['Essen', ['Pizza', 'Brezel', 'Banane', 'Apfel', 'Spiegelei', 'Käse', 'Torte', 'Karotte', 'Erdbeere', 'Brot']],
  ['Küche', ['Topf', 'Pfanne', 'Tasse', 'Teller', 'Löffel', 'Toaster', 'Kühlschrank', 'Gabel', 'Sieb', 'Kochlöffel']],
  ['Wohnen', ['Dusche', 'Zahnbürste', 'Spiegel', 'Badewanne', 'Handtuch', 'Sofa', 'Bett', 'Lampe', 'Fenster', 'Treppe']],
  ['Fahrzeuge', ['Fahrrad', 'Auto', 'Bus', 'Zug', 'Schiff', 'Flugzeug', 'Traktor', 'Rakete', 'Hubschrauber']],
  ['Natur', ['Baum', 'Blume', 'Berg', 'Wolke', 'Sonne', 'Mond', 'Stern', 'Vulkan', 'Wasserfall', 'Insel', 'Pilz']],
  ['Kleidung', ['Socke', 'Mütze', 'Schal', 'Schuh', 'Jacke', 'Brille', 'Krawatte', 'Handschuh', 'Regenschirm']],
  ['Orte', ['Haus', 'Schloss', 'Turm', 'Brücke', 'Zelt', 'Leuchtturm', 'Windmühle', 'Burg', 'Iglu']],
  ['Technik', ['Handy', 'Laptop', 'Kamera', 'Uhr', 'Kopfhörer', 'Fernseher', 'Tastatur', 'Drucker', 'Glühbirne']],
  ['Spiel', ['Fußball', 'Skateboard', 'Schaukel', 'Rutsche', 'Würfel', 'Drachen', 'Trampolin', 'Schlittschuh', 'Ballon']],
  ['Alltag', ['Schlüssel', 'Leiter', 'Besen', 'Eimer', 'Kerze', 'Schaufel', 'Wecker', 'Koffer', 'Rucksack', 'Schere']],
  ['Musik', ['Gitarre', 'Klavier', 'Trommel', 'Geige', 'Flöte', 'Trompete', 'Mikrofon', 'Radio']],
  ['Figuren', ['Einhorn', 'Roboter', 'Gespenst', 'Pirat', 'Schneemann', 'Krone', 'Zauberstab', 'Schatzkiste']],
];

export const WORDS: readonly Word[] = GROUPS.flatMap(([cat, words]) => words.map((word) => ({ word, cat })));
