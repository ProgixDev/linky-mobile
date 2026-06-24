/**
 * Character / « psychique » screening — a short, warm set of behavioural questions
 * that help the admin pick reliable, honest, calm, customer-caring couriers when
 * reviewing an application. Single-select per question; the chosen option VALUE is
 * stored under answers.screening.<id> (ids match ScreeningSchema in model/schema).
 */

export type ScreeningKey = 'reliability' | 'honesty' | 'customer' | 'resourceful' | 'safety';

export type ScreeningOption = { value: string; label: string };
export type ScreeningQuestion = {
  id: ScreeningKey;
  theme: string;
  question: string;
  options: ScreeningOption[];
};

export const SCREENING_QUESTIONS: ScreeningQuestion[] = [
  {
    id: 'reliability',
    theme: 'Fiabilité',
    question: 'Il te reste 3 livraisons mais tu es fatigué. Que fais-tu ?',
    options: [
      { value: 'finish', label: 'Je termine mes 3 livraisons — c’est mon engagement.' },
      { value: 'arrange', label: 'Je préviens et je m’arrange pour qu’elles soient livrées.' },
      { value: 'tomorrow', label: 'Je reporte à demain.' },
      { value: 'stop', label: 'Je m’arrête, je verrai plus tard.' },
    ],
  },
  {
    id: 'honesty',
    theme: 'Honnêteté',
    question: 'Un client te rend trop de monnaie par erreur. Que fais-tu ?',
    options: [
      { value: 'return_now', label: 'Je lui rends la différence tout de suite.' },
      { value: 'tell', label: 'Je le préviens dès que je m’en aperçois.' },
      { value: 'keep_small', label: 'Si c’est une petite somme, je garde.' },
      { value: 'keep', label: 'Je garde — c’est son erreur.' },
    ],
  },
  {
    id: 'customer',
    theme: 'Relation client',
    question: 'Un client est impoli ou mécontent. Comment réagis-tu ?',
    options: [
      { value: 'calm', label: 'Je reste calme et poli, je cherche à l’aider.' },
      { value: 'apologize', label: 'J’écoute, je m’excuse et je règle le souci.' },
      { value: 'defend', label: 'Je me défends — je n’ai rien fait de mal.' },
      { value: 'leave', label: 'Je pose le colis et je pars vite.' },
    ],
  },
  {
    id: 'resourceful',
    theme: 'Débrouillardise',
    question: 'Le client n’est pas chez lui à ton arrivée. Que fais-tu ?',
    options: [
      { value: 'call_wait', label: 'Je l’appelle et j’attends un moment raisonnable.' },
      { value: 'alternative', label: 'Je cherche une solution (voisin, point de dépôt convenu).' },
      { value: 'reschedule', label: 'Je reprogramme la livraison avec lui.' },
      { value: 'leave_now', label: 'Je repars directement avec le colis.' },
    ],
  },
  {
    id: 'safety',
    theme: 'Sécurité',
    question: 'Tu es en retard et pressé. Comment conduis-tu ?',
    options: [
      { value: 'safe', label: 'Je roule prudemment — la sécurité avant tout.' },
      { value: 'inform', label: 'Je préviens du léger retard et je reste prudent.' },
      { value: 'faster', label: 'J’accélère un peu pour rattraper.' },
      { value: 'rush', label: 'Je fonce — le retard n’est pas une option.' },
    ],
  },
];
