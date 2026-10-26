// Levels (école, collège, bac sections, prépa, fac) and starting checklists. These are approximate starting points:
// every student can rename, add or delete chapters in the app.
'use strict';

const GENERIC_STEPS = ['Cours (fhemt l\'cours)', 'Exercices mta3 l\'kteb', 'Sujets bac 9dom', 'Révision finale'];

const BAC_SUBJECTS = {
  Math: ['Limites w continuité', 'Suites réelles', 'Dérivabilité', 'Fonctions réciproques', 'Primitives', 'Intégrales', 'Fonction logarithme',
    'Fonction exponentielle', 'Équations différentielles', 'Nombres complexes', 'Arithmétique', 'Géométrie fel espace', 'Probabilités', 'Statistiques'],
  'Math (eco/info)': ['Limites w continuité', 'Dérivabilité', 'Suites réelles', 'Fonction logarithme', 'Fonction exponentielle', 'Intégrales',
    'Probabilités', 'Statistiques', 'Matrices w systèmes'],
  Physique: ['Condensateur (dipôle RC)', 'Bobine (dipôle RL)', 'Oscillations électriques libres', 'Oscillations électriques forcées', 'Filtres',
    'Oscillations mécaniques', 'Ondes mécaniques', 'Lumière', 'Spectre atomique', 'Noyau atomique w réactions nucléaires'],
  Chimie: ['Cinétique chimique', 'Équilibre chimique', 'Acides w bases (pH)', 'Piles électrochimiques', 'Chimie organique (estérification)'],
  SVT: ['Reproduction humaine', 'Génétique humaine', 'Génétique des diploïdes (brassage)', 'Immunité', 'Système nerveux (neurone, réflexe)',
    'Régulation (glycémie / pression)', 'Évolution'],
  Info: ['Algorithmique', 'Programmation (Python)', 'Bases de données', 'Tableur w réseaux'],
  'Algo w programmation': ['Structures de données', 'Sous-programmes', 'Tri w recherche', 'Récursivité', 'Fichiers', 'Algorithmes arithmétiques',
    'Algorithmes d\'approximation', 'Sujets pratiques'],
  'STI (bases de données)': ['Conception (modèle E/A)', 'Modèle relationnel', 'SQL', 'Web dynamique', 'Réseaux'],
  Technologie: ['Analyse fonctionnelle', 'Définition graphique', 'Mécanique (transmission)', 'Électronique', 'Automatique (GRAFCET)', 'Sujets bac 9dom'],
  Économie: ['Croissance w développement', 'Commerce international', 'Monnaie w financement', 'Emploi w chômage', 'Mondialisation'],
  Gestion: ['Comptabilité', 'Gestion commerciale', 'Gestion financière', 'Gestion des ressources humaines', 'Sujets bac 9dom'],
  'Histoire-Géo': ['Histoire: chapitres', 'Géographie: chapitres', 'Cartes w documents', 'Sujets bac 9dom'],
  Arabe: ['Nousous (textes)', 'Qawa3ed (grammaire)', 'Inchè2 (expression écrite)', 'Sujets bac 9dom'],
  Philo: ['Cours w notions', 'Méthode mta3 l\'dissertation', 'Commentaire de texte', 'Sujets bac 9dom'],
  Français: ['Œuvres w textes', 'Langue (grammaire)', 'Essai / production écrite', 'Sujets bac 9dom'],
  Anglais: ['Units mta3 l\'kteb', 'Grammar', 'Writing', 'Sujets bac 9dom'],
  'Pensée islamique': ['Dourous', 'Méthode', 'Sujets bac 9dom'],
  Sport: ['Théorie (cours)', 'Pratique (épreuves)', 'Sujets bac 9dom'],
  'Arabe (primaire)': ['9ra2a (lecture)', 'Qawa3ed', 'Inchè2', 'Sujets concours 9dom'],
  'Français (primaire)': ['Lecture', 'Grammaire w conjugaison', 'Production écrite', 'Sujets concours 9dom'],
  'Math (primaire)': ['Nombres w opérations', 'Fractions w décimaux', 'Mesures', 'Géométrie', 'Problèmes', 'Sujets concours 9dom'],
  'Éveil scientifique': ['Cours', 'Expériences', 'Sujets concours 9dom'],
  'Math (collège)': ['Nombres w calcul', 'Équations w inéquations', 'Fonctions linéaires w affines', 'Géométrie (Thalès, Pythagore)', 'Trigonométrie', 'Statistiques', 'Sujets concours 9dom'],
  'Physique (collège)': ['Électricité', 'Mécanique', 'Optique', 'Chimie', 'Sujets concours 9dom'],
  'SVT (collège)': ['Nutrition', 'Reproduction', 'Relation w l\'environnement', 'Sujets concours 9dom'],
  'Math (prépa)': ['Analyse', 'Algèbre linéaire', 'Probabilités', 'Sujets concours 9dom'],
  'Physique (prépa)': ['Mécanique', 'Électricité / électronique', 'Thermodynamique', 'Ondes w optique', 'Sujets concours 9dom'],
};

// group = which block it shows in; exam = what the countdown counts down to.
const BAC_SECTIONS = {
  primaire: { group: '🏫 École', exam: 'concours 6ème', name: 'Primaire (6ème)', emoji: '🎒', subjects: ['Arabe (primaire)', 'Français (primaire)', 'Math (primaire)', 'Éveil scientifique', 'Anglais'] },
  college: { group: '🏫 Collège', exam: 'concours 9ème', name: 'Collège (9ème)', emoji: '📘', subjects: ['Math (collège)', 'Physique (collège)', 'SVT (collège)', 'Arabe', 'Français', 'Anglais', 'Histoire-Géo', 'Technologie', 'Info'] },
  prepa: { group: '🎓 Ba3d l\'bac', exam: 'concours', name: 'Prépa', emoji: '🧪', subjects: ['Math (prépa)', 'Physique (prépa)', 'Chimie', 'Info', 'Français', 'Anglais'] },
  medecine: { group: '🎓 Ba3d l\'bac', exam: 'examens', name: 'Médecine', emoji: '🩺', subjects: ['Anatomie', 'Physiologie', 'Biochimie', 'Histologie', 'Biophysique', 'Sémiologie'] },
  pharmacie: { group: '🎓 Ba3d l\'bac', exam: 'examens', name: 'Fremla (Pharmacie)', emoji: '💊', subjects: ['Chimie (pharmacie)', 'Biologie cellulaire', 'Pharmacologie', 'Botanique', 'Physiologie'] },
  escae: { group: '🎓 Ba3d l\'bac', exam: 'examens', name: 'ESCAE / Commerce', emoji: '💼', subjects: ['Comptabilité', 'Marketing', 'Management', 'Économie', 'Math financières', 'Statistiques (fac)', 'Anglais'] },
  ingenieur: { group: '🎓 Ba3d l\'bac', exam: 'examens', name: 'Ingénieur', emoji: '🛠️', subjects: ['Math (prépa)', 'Physique (prépa)', 'Programmation', 'Électronique', 'Projet'] },
  droit: { group: '🎓 Ba3d l\'bac', exam: 'examens', name: 'Droit', emoji: '⚖️', subjects: ['Droit civil', 'Droit constitutionnel', 'Droit administratif', 'Droit pénal', 'Méthodologie'] },
  langues: { group: '🎓 Ba3d l\'bac', exam: 'examens', name: 'Lettres w langues', emoji: '🗣️', subjects: ['Langue', 'Littérature', 'Civilisation', 'Traduction'] },
  iset: { group: '🎓 Ba3d l\'bac', exam: 'examens', name: 'ISET / Licence', emoji: '🏗️', subjects: ['Module 1', 'Module 2', 'Module 3', 'Module 4', 'Stage / projet'] },
  fac: { group: '🎓 Ba3d l\'bac', exam: 'examens', name: 'Fac o5ra (modules mte3ek)', emoji: '🏛️', subjects: [] },
  math: { name: 'Mathématiques', emoji: '📐', subjects: ['Math', 'Physique', 'Chimie', 'SVT', 'Info', 'Philo', 'Arabe', 'Français', 'Anglais'] },
  sciences: { name: 'Sciences expérimentales', emoji: '🧬', subjects: ['SVT', 'Physique', 'Chimie', 'Math', 'Info', 'Philo', 'Arabe', 'Français', 'Anglais'] },
  technique: { name: 'Sciences techniques', emoji: '⚙️', subjects: ['Technologie', 'Math', 'Physique', 'Chimie', 'Info', 'Philo', 'Arabe', 'Français', 'Anglais'] },
  eco: { name: 'Économie w gestion', emoji: '📊', subjects: ['Économie', 'Gestion', 'Math (eco/info)', 'Histoire-Géo', 'Info', 'Philo', 'Arabe', 'Français', 'Anglais'] },
  info: { name: 'Sciences de l\'informatique', emoji: '💻', subjects: ['Algo w programmation', 'STI (bases de données)', 'Math (eco/info)', 'Physique', 'Philo', 'Arabe', 'Français', 'Anglais'] },
  lettres: { name: 'Lettres', emoji: '📜', subjects: ['Arabe', 'Philo', 'Histoire-Géo', 'Français', 'Anglais', 'Pensée islamique', 'Info'] },
  sport: { name: 'Sport', emoji: '🏃', subjects: ['Sport', 'SVT', 'Physique', 'Math (eco/info)', 'Philo', 'Arabe', 'Français', 'Anglais'] },
};
for (const s of Object.values(BAC_SECTIONS)) {
  s.group = s.group || '📚 Lycée (Bac)';
  s.exam = s.exam || 'bac';
}
const SECTION_GROUPS = ['🏫 École', '🏫 Collège', '📚 Lycée (Bac)', '🎓 Ba3d l\'bac'];

/** Builds the starting checklist [{subject, title}] for a section. */
function bacTemplate(section) {
  const s = BAC_SECTIONS[section];
  if (!s) return [];
  return s.subjects.flatMap((subject) => (BAC_SUBJECTS[subject] || GENERIC_STEPS).map((title) => ({ subject, title })));
}

// Short motivation lines in Derja (timer, end of sessions).
const QUOTES = [
  'Chwaya b chwaya, l\'bac yet3adda 💪',
  'Elli ya9ra lyoum, yer9od mrayya7 ghodwa 😌',
  'Ma tchoufch l\'jbal lkol. Chouf l\'khatwa elli 9oddemek.',
  '25 d9i9a bark. Ba3dhom 9ahwa ☕',
  'L\'téléphone yestanna. L\'bac ma yestannech 📵',
  'Kol d9i9a 9raya t9arrbek lel 7olm mte3ek ✨',
  'Ma fammech 3bad 9wiya. Fama 3bad ma sallmouch.',
  'Ki tfechel, 3awed. Ki tkammel, 9ahwa 😄',
  'Enti mouch wa7dek: twensa barcha ya9raw tawa m3ak 🇹🇳',
  'Session wa7da a7sen men sifr. Yallah!',
  'L\'mokh kima l\'3adhla: kol ma tkhaddmou, yetsalla7 🧠',
  'Ab9a mrekez. L\'ghoul yestanna fik 👹',
];

function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}
