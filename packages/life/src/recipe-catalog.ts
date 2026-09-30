// Indian recipe catalogue (South Indian + pan-Indian) for browsing and planning.
// Quantities are per serving. Photos are Wikimedia Commons files (freely
// licensed); `image` holds the Commons file name, see recipeImageUrl().
// `key` on an ingredient is the pantry keyword it is matched against; items
// without a key (salt, spices, curry leaves...) are assumed to be in the kitchen.

export type RecipeRegion = "South Indian" | "North Indian" | "Pan-Indian";
export type RecipeCourse = "Breakfast" | "Main" | "Rice" | "Snack" | "Side" | "Dessert";

export interface CatalogIngredient {
  name: string;
  qty: number;
  unit: "g" | "ml" | "pc" | "tsp" | "tbsp";
  key?: string;
}

export interface CatalogRecipe {
  id: string;
  name: string;
  blurb: string;
  region: RecipeRegion;
  course: RecipeCourse;
  veg: boolean;
  prepMin: number;
  cookMin: number;
  difficulty: "easy" | "medium" | "hard";
  image: string;
  ingredients: CatalogIngredient[];
  steps: string[];
}

export const RECIPE_SERVINGS = 4;

/** Stable Commons redirect that serves a resized copy of the file. */
export function recipeImageUrl(file: string, width = 640): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}?width=${width}`;
}

type I = CatalogIngredient;
const g = (name: string, qty: number, key?: string): I => ({ name, qty, unit: "g", ...(key ? { key } : {}) });
const ml = (name: string, qty: number, key?: string): I => ({ name, qty, unit: "ml", ...(key ? { key } : {}) });
const pc = (name: string, qty: number, key?: string): I => ({ name, qty, unit: "pc", ...(key ? { key } : {}) });
const tsp = (name: string, qty: number, key?: string): I => ({ name, qty, unit: "tsp", ...(key ? { key } : {}) });
const tbsp = (name: string, qty: number, key?: string): I => ({ name, qty, unit: "tbsp", ...(key ? { key } : {}) });

const rawRecipes: CatalogRecipe[] = [
  // ── South Indian · breakfast & tiffin ──────────────────────────────────
  {
    id: "masala-dosa", name: "Masala Dosa", blurb: "Crisp fermented rice-lentil crepe with spiced potato filling.",
    region: "South Indian", course: "Breakfast", veg: true, prepMin: 20, cookMin: 25, difficulty: "medium", image: "Masala_Dosa_2023.jpg",
    ingredients: [g("Dosa rice", 60, "rice"), g("Urad dal", 20), g("Potato", 100, "potato"), g("Onion", 40, "onion"), tsp("Mustard seeds", 0.5), ml("Sunflower oil", 10, "oil")],
    steps: ["Soak rice and urad dal for 6 hours, grind to a batter and ferment overnight.", "Boil and crumble the potatoes; temper mustard, onion, turmeric and curry leaves, then mix in the potato.", "Spread a ladle of batter thin on a hot tawa, drizzle oil and cook until crisp and golden.", "Fill with the potato masala, fold and serve with chutney and sambar."],
  },
  {
    id: "idli", name: "Idli with Sambar", blurb: "Soft steamed rice-lentil cakes, the everyday South Indian breakfast.",
    region: "South Indian", course: "Breakfast", veg: true, prepMin: 15, cookMin: 15, difficulty: "easy", image: "Idli_Sambar.JPG",
    ingredients: [g("Idli rice", 60, "rice"), g("Urad dal", 20), g("Toor dal", 20, "dal"), g("Mixed vegetables", 50)],
    steps: ["Soak rice and urad dal separately, grind smooth and ferment 8 to 10 hours.", "Pour batter into greased idli moulds.", "Steam for 12 minutes until a skewer comes out clean.", "Serve hot with sambar and coconut chutney."],
  },
  {
    id: "medu-vada", name: "Medu Vada", blurb: "Crisp doughnut-shaped fritters of urad dal, soft inside.",
    region: "South Indian", course: "Snack", veg: true, prepMin: 15, cookMin: 20, difficulty: "medium", image: "Medu_Vada.JPG",
    ingredients: [g("Urad dal", 50), g("Onion", 15, "onion"), pc("Green chilli", 1), tsp("Black pepper", 0.5), ml("Sunflower oil", 40, "oil")],
    steps: ["Soak urad dal for 3 hours and grind to a thick, fluffy batter with very little water.", "Fold in chopped chilli, onion, pepper, curry leaves and salt.", "Wet your hands, shape rings and slide into hot oil.", "Fry on medium heat until golden and crisp; drain and serve with sambar."],
  },
  {
    id: "ven-pongal", name: "Ven Pongal", blurb: "Creamy rice and moong dal tempered with pepper, cumin and ghee.",
    region: "South Indian", course: "Breakfast", veg: true, prepMin: 10, cookMin: 25, difficulty: "easy", image: "Ven_pongal_with_sambar_and_chutney.jpg",
    ingredients: [g("Raw rice", 50, "rice"), g("Moong dal", 25), tbsp("Ghee", 1, "ghee"), tsp("Black pepper", 0.5), tsp("Cumin", 0.5), tsp("Ginger", 0.5)],
    steps: ["Dry-roast moong dal lightly and pressure cook with rice and 4 cups water until mushy.", "Temper ghee with pepper, cumin, ginger, curry leaves and cashews.", "Stir the tempering into the rice and mash lightly.", "Serve hot with sambar and chutney."],
  },
  {
    id: "upma", name: "Rava Upma", blurb: "Quick semolina porridge with mustard, onion and curry leaves.",
    region: "South Indian", course: "Breakfast", veg: true, prepMin: 10, cookMin: 15, difficulty: "easy", image: "A_photo_of_Upma.jpg",
    ingredients: [g("Rava (semolina)", 50), g("Onion", 30, "onion"), pc("Green chilli", 1), tsp("Mustard seeds", 0.5), tbsp("Ghee", 0.5, "ghee")],
    steps: ["Dry-roast the rava until fragrant and set aside.", "Temper mustard, chilli, onion and curry leaves in ghee.", "Add hot water, salt and bring to a boil, then stir in rava slowly to avoid lumps.", "Cover and cook 3 minutes; finish with lemon juice."],
  },
  {
    id: "uttapam", name: "Onion Tomato Uttapam", blurb: "Thick dosa-batter pancake topped with onion and tomato.",
    region: "South Indian", course: "Breakfast", veg: true, prepMin: 10, cookMin: 15, difficulty: "easy", image: "Mini_Uttappam.jpg",
    ingredients: [ml("Dosa batter", 150), g("Onion", 30, "onion"), g("Tomato", 30, "tomato"), pc("Green chilli", 1), ml("Sunflower oil", 8, "oil")],
    steps: ["Pour a ladle of batter onto a hot tawa and keep it thick.", "Scatter chopped onion, tomato, chilli and coriander over the top.", "Drizzle oil at the edges, cover and cook until the base is golden.", "Flip briefly and serve with chutney."],
  },
  {
    id: "appam", name: "Appam with Vegetable Stew", blurb: "Lacy-edged fermented rice hoppers with a fluffy centre.",
    region: "South Indian", course: "Breakfast", veg: true, prepMin: 20, cookMin: 25, difficulty: "medium", image: "Appam_-_அப்பம்.jpg",
    ingredients: [g("Raw rice", 70, "rice"), ml("Coconut milk", 100), g("Potato", 60, "potato"), g("Carrot", 40), g("Onion", 30, "onion"), tsp("Sugar", 1, "sugar")],
    steps: ["Grind soaked rice with coconut and a spoon of cooked rice; ferment overnight with sugar.", "Simmer potato, carrot and onion in thin coconut milk with whole spices for the stew.", "Swirl batter in a small appam pan, cover and cook until the centre is soft.", "Serve hot with the stew."],
  },
  {
    id: "pesarattu", name: "Pesarattu", blurb: "Andhra green moong dosa, high in protein and needs no fermenting.",
    region: "South Indian", course: "Breakfast", veg: true, prepMin: 10, cookMin: 15, difficulty: "easy", image: "Pesarattu.jpg",
    ingredients: [g("Whole green moong", 60), g("Raw rice", 10, "rice"), pc("Green chilli", 1), tsp("Ginger", 0.5), tsp("Cumin", 0.5)],
    steps: ["Soak moong and rice for 4 hours.", "Grind with chilli, ginger, cumin and salt to a pourable batter.", "Spread thin on a hot tawa, drizzle oil and cook until crisp.", "Serve with ginger chutney."],
  },
  {
    id: "rava-dosa", name: "Rava Dosa", blurb: "Lacy, crisp instant dosa made with semolina and rice flour.",
    region: "South Indian", course: "Breakfast", veg: true, prepMin: 10, cookMin: 20, difficulty: "medium", image: "Dosa_at_Sri_Ganesha_Restauran,_Bangkok_(44570742744).jpg",
    ingredients: [g("Rava (semolina)", 40), g("Rice flour", 20), g("Maida", 10), ml("Curd", 30, "curd"), g("Onion", 20, "onion"), tsp("Cumin", 0.5)],
    steps: ["Whisk rava, rice flour, maida and curd with water into a thin, runny batter; rest 15 minutes.", "Stir in onion, chilli, cumin and pepper.", "Pour from a height over a hot tawa to make a lacy pattern.", "Drizzle oil, cook until crisp and serve folded."],
  },
  {
    id: "idiyappam", name: "Idiyappam", blurb: "Steamed rice-flour string hoppers, lovely with egg or vegetable curry.",
    region: "South Indian", course: "Breakfast", veg: true, prepMin: 15, cookMin: 10, difficulty: "medium", image: "Idiyappam_with_Egg_Masala_Curry.jpg",
    ingredients: [g("Rice flour", 60), ml("Hot water", 90), tsp("Sesame oil", 0.5), g("Grated coconut", 15)],
    steps: ["Mix rice flour with salt and hot water into a soft dough.", "Fill an idiyappam press and squeeze strings onto oiled idli plates.", "Sprinkle grated coconut and steam for 8 minutes.", "Serve with egg curry, stew or coconut milk and sugar."],
  },
  {
    id: "puttu", name: "Puttu with Kadala Curry", blurb: "Kerala steamed cylinders of rice flour and coconut with black chickpea curry.",
    region: "South Indian", course: "Breakfast", veg: true, prepMin: 15, cookMin: 25, difficulty: "medium", image: "Puttu_(Rice_Flour_steamed_cake).jpg",
    ingredients: [g("Puttu rice flour", 60), g("Grated coconut", 25), g("Black chickpeas", 40), g("Onion", 30, "onion"), g("Tomato", 30, "tomato"), tsp("Coriander powder", 1)],
    steps: ["Sprinkle salted water into the flour and rub to a crumbly texture.", "Layer flour and coconut in the puttu maker and steam for 8 minutes.", "Pressure cook soaked chickpeas; simmer with onion, tomato, coconut and spices.", "Serve the puttu with the curry."],
  },
  {
    id: "coconut-chutney", name: "Coconut Chutney", blurb: "Fresh coconut, green chilli and roasted chana dal ground with a mustard tempering.",
    region: "South Indian", course: "Side", veg: true, prepMin: 10, cookMin: 3, difficulty: "easy", image: "Coconut_Chutney_-_Home_Made.JPG",
    ingredients: [g("Grated coconut", 30), tbsp("Roasted chana dal", 0.5), pc("Green chilli", 1), ml("Curd", 15, "curd"), tsp("Mustard seeds", 0.25)],
    steps: ["Grind coconut, chana dal, chilli and salt with water to a smooth paste.", "Stir in a little curd for tang.", "Temper mustard and curry leaves in hot oil.", "Pour over the chutney."],
  },

  // ── South Indian · mains, rice, sides ──────────────────────────────────
  {
    id: "sambar", name: "Sambar", blurb: "Tamarind-tangy toor dal stew with drumstick, pumpkin and sambar powder.",
    region: "South Indian", course: "Main", veg: true, prepMin: 15, cookMin: 30, difficulty: "medium", image: "Pumpkin_sambar.JPG",
    ingredients: [g("Toor dal", 35, "dal"), g("Mixed vegetables", 80), g("Onion", 30, "onion"), g("Tomato", 40, "tomato"), tsp("Sambar powder", 1.5), g("Tamarind", 8)],
    steps: ["Pressure cook toor dal with turmeric until soft and mash.", "Boil the vegetables with tamarind water and sambar powder.", "Add the dal and simmer 10 minutes.", "Temper mustard, dry red chilli, hing and curry leaves and stir in."],
  },
  {
    id: "rasam", name: "Tomato Rasam", blurb: "Peppery, tamarind-and-tomato soup that doubles as a digestive.",
    region: "South Indian", course: "Main", veg: true, prepMin: 10, cookMin: 15, difficulty: "easy", image: "Rasam.JPG",
    ingredients: [g("Tomato", 60, "tomato"), g("Toor dal (cooked)", 20, "dal"), g("Tamarind", 6), tsp("Rasam powder", 1), tsp("Black pepper", 0.5), tsp("Cumin", 0.5)],
    steps: ["Crush tomatoes into tamarind water with rasam powder, salt and turmeric.", "Simmer until raw smell goes, then add cooked dal water.", "Bring just to a froth, do not boil hard.", "Temper mustard, cumin, garlic and curry leaves in ghee and pour over."],
  },
  {
    id: "curd-rice", name: "Curd Rice", blurb: "Cooling yoghurt rice tempered with mustard and curry leaves.",
    region: "South Indian", course: "Rice", veg: true, prepMin: 5, cookMin: 10, difficulty: "easy", image: "Curd_Rice.jpg",
    ingredients: [g("Cooked rice", 150, "rice"), ml("Curd", 100, "curd"), ml("Milk", 30, "milk"), tsp("Mustard seeds", 0.5), tsp("Ginger", 0.5), pc("Green chilli", 1)],
    steps: ["Mash warm rice well with milk and salt.", "Mix in curd once cooled.", "Temper mustard, chilli, ginger and curry leaves in oil.", "Fold into the rice and chill before serving."],
  },
  {
    id: "lemon-rice", name: "Lemon Rice (Chitranna)", blurb: "Turmeric-yellow rice with peanuts, lemon and curry leaves.",
    region: "South Indian", course: "Rice", veg: true, prepMin: 10, cookMin: 10, difficulty: "easy", image: "Chitranna_and_Payasa.jpg",
    ingredients: [g("Cooked rice", 150, "rice"), tbsp("Lemon juice", 1), tbsp("Peanuts", 1), tsp("Mustard seeds", 0.5), tsp("Turmeric", 0.25), ml("Sunflower oil", 8, "oil")],
    steps: ["Temper mustard, chana dal, peanuts, chilli and curry leaves in oil.", "Add turmeric and hing, then the cooked rice.", "Toss gently with salt.", "Turn off heat and mix in lemon juice."],
  },
  {
    id: "tamarind-rice", name: "Puliyogare (Tamarind Rice)", blurb: "Temple-style tangy tamarind rice with roasted spice paste.",
    region: "South Indian", course: "Rice", veg: true, prepMin: 15, cookMin: 20, difficulty: "medium", image: "Pulihara.JPG",
    ingredients: [g("Cooked rice", 150, "rice"), g("Tamarind", 12), tbsp("Peanuts", 1), tsp("Sesame oil", 1), tsp("Puliyogare powder", 2)],
    steps: ["Cook tamarind pulp with jaggery and salt until thick.", "Temper mustard, chana dal, peanuts and curry leaves in sesame oil.", "Add the tamarind paste and roasted puliyogare powder.", "Mix through cooled rice and rest 30 minutes."],
  },
  {
    id: "tomato-rice", name: "Tomato Rice", blurb: "Tangy one-pot rice with tomato, onion and whole spices.",
    region: "South Indian", course: "Rice", veg: true, prepMin: 10, cookMin: 20, difficulty: "easy", image: "Tomato_Rice_AP.jpg",
    ingredients: [g("Basmati rice", 70, "rice"), g("Tomato", 100, "tomato"), g("Onion", 40, "onion"), tsp("Red chilli powder", 1), ml("Sunflower oil", 10, "oil")],
    steps: ["Saute whole spices, onion and green chilli in oil.", "Cook tomatoes with chilli powder and salt until pulpy.", "Add soaked rice and water (1:1.5).", "Cover and cook until fluffy."],
  },
  {
    id: "bisi-bele-bath", name: "Bisi Bele Bath", blurb: "Karnataka's spiced rice-lentil-vegetable one-pot with ghee.",
    region: "South Indian", course: "Rice", veg: true, prepMin: 20, cookMin: 35, difficulty: "medium", image: "Bisi_Bele_Bath_(Bisibelebath).JPG",
    ingredients: [g("Rice", 50, "rice"), g("Toor dal", 30, "dal"), g("Mixed vegetables", 80), g("Tamarind", 6), tsp("Bisi bele bath powder", 2), tbsp("Ghee", 1, "ghee")],
    steps: ["Cook rice and toor dal together until very soft.", "Simmer vegetables with tamarind and bisi bele bath powder.", "Combine with the rice-dal and loosen with hot water.", "Finish with a ghee tempering of mustard, cashew and curry leaves."],
  },
  {
    id: "vegetable-pulao", name: "Vegetable Pulao", blurb: "Fragrant basmati rice with peas, carrot and whole spices.",
    region: "Pan-Indian", course: "Rice", veg: true, prepMin: 15, cookMin: 20, difficulty: "easy", image: "Vegetable_Pulao_as_served_in_South_India.jpg",
    ingredients: [g("Basmati rice", 75, "rice"), g("Mixed vegetables", 80), g("Onion", 40, "onion"), tbsp("Ghee", 1, "ghee"), tsp("Garam masala", 0.5)],
    steps: ["Rinse and soak basmati for 20 minutes.", "Saute whole spices and onion in ghee, add vegetables.", "Add rice and 1.5 times the water; season.", "Cook covered on low heat until each grain is separate."],
  },
  {
    id: "chicken-biryani", name: "Hyderabadi Chicken Biryani", blurb: "Dum-cooked basmati layered with marinated chicken and fried onions.",
    region: "South Indian", course: "Rice", veg: false, prepMin: 40, cookMin: 50, difficulty: "hard", image: "Hyderabadi_Chicken_Biryani.jpg",
    ingredients: [g("Basmati rice", 100, "rice"), g("Chicken", 200, "chicken"), g("Onion", 80, "onion"), ml("Curd", 50, "curd"), tbsp("Ghee", 1, "ghee"), g("Mint leaves", 10, "mint"), tsp("Biryani masala", 1.5)],
    steps: ["Marinate chicken with curd, ginger-garlic and spices for 2 hours.", "Fry onions until deep brown; par-boil rice with whole spices.", "Layer chicken, fried onion, mint and rice in a heavy pot.", "Seal and cook on dum (low heat) for 30 minutes; rest before opening."],
  },
  {
    id: "malabar-biryani", name: "Malabar Chicken Biryani", blurb: "Kerala's fragrant, milder biryani made with short-grain rice.",
    region: "South Indian", course: "Rice", veg: false, prepMin: 40, cookMin: 50, difficulty: "hard", image: "Malabar_chicken_biriyani.jpg",
    ingredients: [g("Kaima / basmati rice", 100, "rice"), g("Chicken", 200, "chicken"), g("Onion", 90, "onion"), g("Tomato", 40, "tomato"), tbsp("Ghee", 1, "ghee"), g("Mint leaves", 8, "mint")],
    steps: ["Cook a masala of onion, tomato, ginger-garlic and chicken until tender.", "Fry sliced onion, cashew and raisins in ghee.", "Par-cook the rice with whole spices.", "Layer masala and rice and steam on dum for 25 minutes."],
  },
  {
    id: "kerala-fish-curry", name: "Kerala Fish Curry (Meen Curry)", blurb: "Tangy, red kodampuli fish curry cooked in a clay pot.",
    region: "South Indian", course: "Main", veg: false, prepMin: 15, cookMin: 25, difficulty: "medium", image: "Meen_curry_2.JPG",
    ingredients: [g("Fish steaks", 150), g("Onion", 40, "onion"), g("Tomato", 40, "tomato"), tsp("Kashmiri chilli powder", 1.5), g("Kodampuli", 5), ml("Coconut oil", 10, "oil")],
    steps: ["Grind or mix chilli, turmeric and coriander powder with water.", "Saute shallots, ginger, garlic and curry leaves in coconut oil.", "Add the spice paste, kodampuli and water; bring to a boil.", "Slide in the fish and simmer 10 minutes; rest before serving."],
  },
  {
    id: "chettinad-chicken", name: "Chettinad Chicken", blurb: "Fiery Tamil chicken curry with freshly roasted pepper and spices.",
    region: "South Indian", course: "Main", veg: false, prepMin: 20, cookMin: 35, difficulty: "medium", image: "ChickenChettinad.JPG",
    ingredients: [g("Chicken", 200, "chicken"), g("Onion", 60, "onion"), g("Tomato", 50, "tomato"), tsp("Chettinad masala", 2), g("Grated coconut", 15), ml("Sunflower oil", 15, "oil")],
    steps: ["Dry roast pepper, fennel, cloves and red chillies; grind with coconut.", "Saute onion, ginger-garlic and tomato in oil.", "Add chicken and the masala paste, cook covered until tender.", "Finish with curry leaves and a crack of black pepper."],
  },
  {
    id: "chicken-65", name: "Chicken 65", blurb: "Spicy deep-fried chicken bites with curry leaves and green chilli.",
    region: "South Indian", course: "Snack", veg: false, prepMin: 30, cookMin: 15, difficulty: "medium", image: "Chicken_65_(Dish).jpg",
    ingredients: [g("Boneless chicken", 150, "chicken"), ml("Curd", 20, "curd"), tsp("Red chilli powder", 1), tbsp("Corn flour", 1), ml("Sunflower oil", 40, "oil"), pc("Green chilli", 2)],
    steps: ["Marinate chicken with curd, chilli, ginger-garlic paste and salt for 30 minutes.", "Coat with corn flour and a little rice flour.", "Deep fry in hot oil until crisp.", "Toss with fried curry leaves and green chilli."],
  },
  {
    id: "south-indian-chicken-curry", name: "South Indian Chicken Curry", blurb: "Everyday coconut-and-pepper chicken curry for rice or parotta.",
    region: "South Indian", course: "Main", veg: false, prepMin: 15, cookMin: 30, difficulty: "easy", image: "South_Indian_Chicken_curry.jpg",
    ingredients: [g("Chicken", 200, "chicken"), g("Onion", 60, "onion"), g("Tomato", 50, "tomato"), tsp("Curry powder", 2), g("Grated coconut", 20), ml("Sunflower oil", 12, "oil")],
    steps: ["Saute onion, ginger-garlic and curry leaves in oil.", "Add tomato and curry powder and cook to a paste.", "Add chicken and water, simmer until tender.", "Stir in ground coconut and cook 5 minutes."],
  },
  {
    id: "fish-fry", name: "South Indian Masala Fish Fry", blurb: "Shallow-fried fish coated in a red chilli and pepper masala.",
    region: "South Indian", course: "Snack", veg: false, prepMin: 20, cookMin: 10, difficulty: "easy", image: "South-Indian_Masala_Fish_Fry.jpg",
    ingredients: [g("Fish steaks", 150), tsp("Kashmiri chilli powder", 1.5), tsp("Ginger-garlic paste", 1), tsp("Lemon juice", 1), ml("Sunflower oil", 20, "oil")],
    steps: ["Mix chilli powder, pepper, turmeric, ginger-garlic, lemon and salt into a paste.", "Coat the fish and rest 20 minutes.", "Shallow fry on medium heat until crisp on both sides.", "Serve with onion rings and lemon."],
  },
  {
    id: "avial", name: "Avial", blurb: "Kerala mixed vegetables in a coconut-curd-cumin gravy, finished with coconut oil.",
    region: "South Indian", course: "Side", veg: true, prepMin: 20, cookMin: 20, difficulty: "medium", image: "Ayiyal.jpg",
    ingredients: [g("Mixed vegetables", 120), g("Grated coconut", 30), ml("Curd", 40, "curd"), pc("Green chilli", 2), tsp("Cumin", 0.5), tsp("Coconut oil", 1)],
    steps: ["Cut vegetables into long batons and cook with turmeric and salt until just tender.", "Grind coconut, chilli and cumin coarsely.", "Add to the vegetables with whisked curd and warm through.", "Finish with raw coconut oil and curry leaves."],
  },
  {
    id: "kootu", name: "Cabbage Kootu", blurb: "Mild Tamil lentil-and-vegetable curry with a coconut paste.",
    region: "South Indian", course: "Side", veg: true, prepMin: 10, cookMin: 25, difficulty: "easy", image: "Cabbage_kootu.jpg",
    ingredients: [g("Cabbage", 100), g("Moong dal", 25), g("Grated coconut", 15), tsp("Cumin", 0.5), pc("Green chilli", 1)],
    steps: ["Cook moong dal until soft.", "Boil the cabbage with turmeric and salt.", "Grind coconut, chilli and cumin, and simmer with dal and cabbage.", "Temper mustard, urad dal and curry leaves."],
  },
  {
    id: "sundal", name: "Chickpea Sundal", blurb: "Marina-beach style tempered chickpeas with coconut.",
    region: "South Indian", course: "Snack", veg: true, prepMin: 10, cookMin: 20, difficulty: "easy", image: "Marina_beach_sundal.jpg",
    ingredients: [g("Chickpeas (soaked)", 60), g("Grated coconut", 15), tsp("Mustard seeds", 0.5), pc("Green chilli", 1), tsp("Sunflower oil", 1, "oil")],
    steps: ["Pressure cook soaked chickpeas with salt.", "Temper mustard, dry chilli, curry leaves and hing in oil.", "Toss the chickpeas with the tempering.", "Stir in coconut and a squeeze of raw mango or lemon."],
  },
  {
    id: "murukku", name: "Murukku", blurb: "Crunchy spiral rice-and-urad snack for festivals.",
    region: "South Indian", course: "Snack", veg: true, prepMin: 20, cookMin: 20, difficulty: "hard", image: "A_Traditional_Tamil_Snack_Murukku.jpg",
    ingredients: [g("Rice flour", 50), g("Urad dal flour", 10), tsp("Cumin", 0.5), tsp("Sesame seeds", 0.5), tsp("Butter", 1), ml("Sunflower oil", 40, "oil")],
    steps: ["Knead flours with cumin, sesame, butter, salt and water into a soft dough.", "Fill a murukku press and pipe spirals on a greased sheet.", "Deep fry on medium heat until the bubbling nearly stops.", "Cool completely and store airtight."],
  },
  {
    id: "rava-kesari", name: "Rava Kesari", blurb: "Saffron-tinted semolina sweet, rich with ghee and cashews.",
    region: "South Indian", course: "Dessert", veg: true, prepMin: 5, cookMin: 15, difficulty: "easy", image: "KEsari_baat.jpg",
    ingredients: [g("Rava (semolina)", 40), g("Sugar", 50, "sugar"), tbsp("Ghee", 1.5, "ghee"), tbsp("Cashew", 1), tsp("Cardamom", 0.25)],
    steps: ["Roast rava in ghee until fragrant; fry cashews separately.", "Boil water with a pinch of kesari colour.", "Add rava and stir to avoid lumps until it thickens.", "Add sugar, cardamom and cashews; cook until ghee separates."],
  },
  {
    id: "mysore-pak", name: "Mysore Pak", blurb: "Buttery gram-flour sweet that melts on the tongue.",
    region: "South Indian", course: "Dessert", veg: true, prepMin: 10, cookMin: 25, difficulty: "hard", image: "Mysore_pak.jpg",
    ingredients: [g("Besan", 25), g("Sugar", 50, "sugar"), tbsp("Ghee", 3, "ghee")],
    steps: ["Roast besan in a spoon of ghee for a minute.", "Make a one-string sugar syrup.", "Add besan gradually with hot ghee, stirring constantly.", "Pour into a greased tray when it foams and pulls from the sides; cut once warm."],
  },
  {
    id: "kheer", name: "Kheer / Payasam", blurb: "Slow-cooked milk and rice pudding with cardamom.",
    region: "Pan-Indian", course: "Dessert", veg: true, prepMin: 5, cookMin: 40, difficulty: "easy", image: "Kheer.jpg",
    ingredients: [g("Rice", 20, "rice"), ml("Milk", 250, "milk"), g("Sugar", 25, "sugar"), tsp("Cardamom", 0.25), tbsp("Cashew & raisins", 1)],
    steps: ["Simmer washed rice in milk on low heat, stirring often.", "Cook until the rice is soft and the milk reduces by a third.", "Add sugar and cardamom.", "Garnish with ghee-fried cashews and raisins."],
  },

  // ── North Indian & pan-Indian ───────────────────────────────────────────
  {
    id: "butter-chicken", name: "Butter Chicken", blurb: "Tandoori chicken in a silky tomato-butter-cream gravy.",
    region: "North Indian", course: "Main", veg: false, prepMin: 30, cookMin: 30, difficulty: "medium", image: "Butter_Chicken_&_Butter_Naan_-_Home_-_Chandigarh_-_India_-_0006.jpg",
    ingredients: [g("Chicken", 200, "chicken"), g("Tomato", 120, "tomato"), ml("Curd", 30, "curd"), tbsp("Butter", 1), ml("Cream", 30), tsp("Kasuri methi", 1), tsp("Kashmiri chilli powder", 1)],
    steps: ["Marinate chicken in curd and spices; grill or pan-sear.", "Simmer tomatoes with ginger-garlic and strain to a smooth puree.", "Cook the puree with butter, chilli and garam masala.", "Add chicken, cream and crushed kasuri methi; simmer 8 minutes."],
  },
  {
    id: "tandoori-chicken", name: "Tandoori Chicken", blurb: "Yoghurt-and-spice marinated chicken, charred until smoky.",
    region: "North Indian", course: "Main", veg: false, prepMin: 240, cookMin: 25, difficulty: "medium", image: "Chickentandoori.jpg",
    ingredients: [g("Chicken legs", 250, "chicken"), ml("Curd", 60, "curd"), tsp("Kashmiri chilli powder", 2), tsp("Ginger-garlic paste", 2), tsp("Lemon juice", 1), tsp("Garam masala", 1)],
    steps: ["Score the chicken and rub with lemon juice, salt and chilli.", "Marinate in curd, ginger-garlic and spices for at least 4 hours.", "Roast at 230°C or grill until charred at the edges.", "Rest 5 minutes and serve with onion and mint chutney."],
  },
  {
    id: "rogan-josh", name: "Rogan Josh", blurb: "Kashmiri slow-cooked mutton in a deep red, aromatic gravy.",
    region: "North Indian", course: "Main", veg: false, prepMin: 20, cookMin: 60, difficulty: "hard", image: "Rogan_Josh_Kashmiri.jpg",
    ingredients: [g("Mutton", 200), ml("Curd", 40, "curd"), g("Onion", 60, "onion"), tsp("Kashmiri chilli powder", 2), tsp("Fennel powder", 1), tbsp("Ghee", 1, "ghee")],
    steps: ["Brown mutton in ghee with whole spices.", "Add chilli, fennel and ginger powders with whisked curd.", "Add onion paste and a little water; cover.", "Cook on low heat until the meat is tender and the oil floats."],
  },
  {
    id: "mutton-curry", name: "Home-style Mutton Curry", blurb: "Onion-tomato mutton curry pressure cooked with whole spices.",
    region: "North Indian", course: "Main", veg: false, prepMin: 15, cookMin: 45, difficulty: "medium", image: "Indian_mutton_Curry.JPG",
    ingredients: [g("Mutton", 200), g("Onion", 80, "onion"), g("Tomato", 60, "tomato"), tsp("Ginger-garlic paste", 2), tsp("Garam masala", 1), ml("Sunflower oil", 15, "oil")],
    steps: ["Saute onion until golden, add ginger-garlic and tomato.", "Add mutton and spice powders and sear.", "Pressure cook 6 to 7 whistles with a little water.", "Simmer uncovered to thicken; finish with garam masala."],
  },
  {
    id: "egg-curry", name: "Egg Curry (Anda Masala)", blurb: "Boiled eggs simmered in a spiced onion-tomato gravy.",
    region: "Pan-Indian", course: "Main", veg: false, prepMin: 10, cookMin: 20, difficulty: "easy", image: "Egg_curry_Indian_style.jpg",
    ingredients: [pc("Eggs", 2, "egg"), g("Onion", 60, "onion"), g("Tomato", 60, "tomato"), tsp("Garam masala", 0.5), tsp("Chilli powder", 1), ml("Sunflower oil", 10, "oil")],
    steps: ["Hard boil the eggs, peel and lightly score them.", "Saute onion, ginger-garlic and tomato with spices into a masala.", "Add water to make a gravy and simmer.", "Add the eggs and cook 5 minutes."],
  },
  {
    id: "dal-tadka", name: "Dal Tadka", blurb: "Yellow toor dal finished with a sizzling garlic-cumin tempering.",
    region: "North Indian", course: "Main", veg: true, prepMin: 10, cookMin: 25, difficulty: "easy", image: "Dal_Tadka-Delhi.jpg",
    ingredients: [g("Toor dal", 50, "dal"), g("Onion", 30, "onion"), g("Tomato", 40, "tomato"), tbsp("Ghee", 1, "ghee"), tsp("Cumin", 0.5), tsp("Garlic", 1)],
    steps: ["Pressure cook dal with turmeric and salt until soft; whisk smooth.", "Heat ghee, splutter cumin, add garlic, dry chilli and onion.", "Add tomato and cook until soft, then pour into the dal.", "Simmer 5 minutes and finish with coriander."],
  },
  {
    id: "dal-makhani", name: "Dal Makhani", blurb: "Slow-simmered black lentils and kidney beans in butter and cream.",
    region: "North Indian", course: "Main", veg: true, prepMin: 480, cookMin: 60, difficulty: "medium", image: "Punjabi_style_Dal_Makhani.jpg",
    ingredients: [g("Whole urad dal", 40), g("Rajma", 10), g("Tomato", 80, "tomato"), tbsp("Butter", 1), ml("Cream", 25), tsp("Ginger-garlic paste", 1.5)],
    steps: ["Soak urad and rajma overnight, then pressure cook until very soft.", "Cook tomato puree with ginger-garlic and chilli.", "Combine with the lentils and simmer on low for 45 minutes.", "Finish with butter and cream."],
  },
  {
    id: "rajma-masala", name: "Rajma Masala", blurb: "Punjabi kidney beans in a thick onion-tomato gravy, best with rice.",
    region: "North Indian", course: "Main", veg: true, prepMin: 480, cookMin: 40, difficulty: "easy", image: "Rajma_Masala_(32081557778).jpg",
    ingredients: [g("Rajma", 50), g("Onion", 60, "onion"), g("Tomato", 70, "tomato"), tsp("Ginger-garlic paste", 1.5), tsp("Garam masala", 0.5), ml("Sunflower oil", 10, "oil")],
    steps: ["Soak rajma overnight and pressure cook until soft.", "Fry onion, ginger-garlic and tomato with spices into a thick masala.", "Add the rajma with its liquid and mash a few beans.", "Simmer 15 minutes."],
  },
  {
    id: "chana-masala", name: "Chana Masala", blurb: "Tangy spiced chickpea curry, the base of chole bhature.",
    region: "North Indian", course: "Main", veg: true, prepMin: 480, cookMin: 35, difficulty: "easy", image: "Chana_masala.jpg",
    ingredients: [g("Chickpeas", 60), g("Onion", 60, "onion"), g("Tomato", 70, "tomato"), tsp("Chana masala", 1.5), tsp("Ginger-garlic paste", 1), ml("Sunflower oil", 10, "oil")],
    steps: ["Soak chickpeas overnight and pressure cook with salt.", "Cook onion, ginger-garlic and tomato with chana masala.", "Add the chickpeas and simmer 15 minutes.", "Finish with lemon and coriander."],
  },
  {
    id: "chole-bhature", name: "Chole Bhature", blurb: "Spicy chickpea curry with puffed, fried leavened bread.",
    region: "North Indian", course: "Main", veg: true, prepMin: 60, cookMin: 40, difficulty: "hard", image: "Chole_Bhature_from_Nagpur.JPG",
    ingredients: [g("Chickpeas", 60), g("Maida", 70), ml("Curd", 30, "curd"), g("Onion", 40, "onion"), g("Tomato", 50, "tomato"), ml("Sunflower oil", 40, "oil")],
    steps: ["Cook chole with tea water, onion, tomato and chole masala.", "Knead maida with curd, salt, sugar and baking soda; rest 1 hour.", "Roll into ovals and deep fry until puffed.", "Serve hot with onion and pickle."],
  },
  {
    id: "aloo-gobi", name: "Aloo Gobi", blurb: "Dry-style potato and cauliflower sauteed with turmeric and cumin.",
    region: "North Indian", course: "Side", veg: true, prepMin: 15, cookMin: 20, difficulty: "easy", image: "Aloo_Ghobi.jpg",
    ingredients: [g("Potato", 100, "potato"), g("Cauliflower", 120), g("Onion", 30, "onion"), g("Tomato", 40, "tomato"), tsp("Cumin", 0.5), ml("Sunflower oil", 10, "oil")],
    steps: ["Temper cumin, add onion and tomato and cook down.", "Add turmeric, coriander powder and the vegetables.", "Cover and cook on low, stirring now and then.", "Finish with garam masala and coriander."],
  },
  {
    id: "palak-paneer", name: "Palak Paneer", blurb: "Paneer cubes in a smooth, gently spiced spinach gravy.",
    region: "North Indian", course: "Main", veg: true, prepMin: 15, cookMin: 20, difficulty: "easy", image: "Palakpaneer_Rayagada_Odisha_0009.jpg",
    ingredients: [g("Paneer", 80), g("Spinach", 150), g("Onion", 40, "onion"), g("Tomato", 40, "tomato"), tsp("Ginger-garlic paste", 1), ml("Cream", 10)],
    steps: ["Blanch spinach for 2 minutes, plunge into cold water and puree.", "Saute onion, ginger-garlic and tomato with spices.", "Add the spinach puree and simmer briefly to keep it green.", "Add paneer and cream and warm through."],
  },
  {
    id: "paneer-butter-masala", name: "Paneer Butter Masala", blurb: "Soft paneer in a rich, mildly sweet tomato-butter gravy.",
    region: "North Indian", course: "Main", veg: true, prepMin: 15, cookMin: 25, difficulty: "easy", image: "Paneer_butter_masala_2.jpg",
    ingredients: [g("Paneer", 80), g("Tomato", 120, "tomato"), tbsp("Butter", 1), ml("Cream", 25), g("Cashew paste", 10), tsp("Kasuri methi", 1)],
    steps: ["Boil tomato with ginger and cashews, then blend smooth.", "Simmer the puree in butter with chilli and garam masala.", "Add water to loosen, then paneer cubes.", "Stir in cream and crushed kasuri methi."],
  },
  {
    id: "kadai-paneer", name: "Kadai Paneer", blurb: "Paneer tossed with capsicum in a crushed coriander-chilli masala.",
    region: "North Indian", course: "Main", veg: true, prepMin: 15, cookMin: 20, difficulty: "easy", image: "Kadai_Paneer-Delhi-12.jpg",
    ingredients: [g("Paneer", 80), g("Capsicum", 60), g("Onion", 40, "onion"), g("Tomato", 60, "tomato"), tsp("Kadai masala", 1.5), ml("Sunflower oil", 10, "oil")],
    steps: ["Dry roast and crush coriander seeds and dried chillies for the kadai masala.", "Saute onion, tomato and capsicum in a wok.", "Add the masala and paneer.", "Cook briefly on high heat and finish with coriander."],
  },
  {
    id: "malai-kofta", name: "Malai Kofta", blurb: "Paneer-potato dumplings in a creamy cashew-tomato gravy.",
    region: "North Indian", course: "Main", veg: true, prepMin: 30, cookMin: 35, difficulty: "hard", image: "Malai_Kofta_Curry.jpg",
    ingredients: [g("Paneer", 40), g("Potato", 60, "potato"), g("Tomato", 80, "tomato"), ml("Cream", 25), g("Cashew paste", 10), ml("Sunflower oil", 30, "oil")],
    steps: ["Mash potato and paneer with corn flour and salt; shape balls.", "Deep fry the koftas until golden.", "Make a smooth gravy of tomato, cashew and spices; add cream.", "Add koftas just before serving."],
  },
  {
    id: "baingan-bharta", name: "Baingan Bharta", blurb: "Smoky roasted aubergine mashed with onion, tomato and green chilli.",
    region: "North Indian", course: "Side", veg: true, prepMin: 10, cookMin: 30, difficulty: "easy", image: "Baigan_Bharta_from_Nagpur.JPG",
    ingredients: [g("Aubergine (large)", 200), g("Onion", 50, "onion"), g("Tomato", 60, "tomato"), tsp("Ginger-garlic paste", 1), pc("Green chilli", 1), ml("Sunflower oil", 10, "oil")],
    steps: ["Roast the aubergine over open flame until the skin is charred and the flesh soft.", "Peel and mash it.", "Saute onion, ginger-garlic and tomato with spices.", "Mix in the mash and cook 5 minutes."],
  },
  {
    id: "bhindi-masala", name: "Bhindi Masala", blurb: "Non-slimy okra sauteed with onion and dry spices.",
    region: "North Indian", course: "Side", veg: true, prepMin: 10, cookMin: 20, difficulty: "easy", image: "Punjabi_bhindi_masala.jpg",
    ingredients: [g("Okra", 150), g("Onion", 50, "onion"), g("Tomato", 40, "tomato"), tsp("Amchur", 0.5), tsp("Coriander powder", 1), ml("Sunflower oil", 12, "oil")],
    steps: ["Wash and dry the okra completely before cutting.", "Fry okra on high heat until it stops being sticky; set aside.", "Cook onion, tomato and spices.", "Toss okra back in with amchur and finish."],
  },
  {
    id: "khichdi", name: "Dal Khichdi", blurb: "Comforting one-pot rice and lentils, gentle on the stomach.",
    region: "Pan-Indian", course: "Rice", veg: true, prepMin: 10, cookMin: 25, difficulty: "easy", image: "Dall_Khichdi.jpg",
    ingredients: [g("Rice", 40, "rice"), g("Moong dal", 40), tbsp("Ghee", 1, "ghee"), tsp("Cumin", 0.5), g("Mixed vegetables", 50)],
    steps: ["Wash rice and dal together.", "Temper cumin, ginger and hing in ghee.", "Add rice, dal, vegetables, turmeric and water.", "Pressure cook until soft and porridge-like."],
  },
  {
    id: "jeera-rice", name: "Jeera Rice", blurb: "Cumin-scented basmati, the everyday partner for dal and curries.",
    region: "North Indian", course: "Rice", veg: true, prepMin: 5, cookMin: 20, difficulty: "easy", image: "Jeera-rice.JPG",
    ingredients: [g("Basmati rice", 75, "rice"), tsp("Cumin", 1), tbsp("Ghee", 1, "ghee"), pc("Bay leaf", 1)],
    steps: ["Rinse and soak basmati for 20 minutes.", "Splutter cumin and bay leaf in ghee.", "Add drained rice and 1.5 times water with salt.", "Cook covered until fluffy."],
  },
  {
    id: "chapati", name: "Chapati / Roti", blurb: "Soft whole-wheat flatbread puffed on the tawa.",
    region: "Pan-Indian", course: "Side", veg: true, prepMin: 20, cookMin: 15, difficulty: "easy", image: "2020-05-08_19_34_28_Chapati_being_made_in_a_pan_in_the_Franklin_Farm_section_of_Oak_Hill,_Fairfax_County,_Virginia.jpg",
    ingredients: [g("Wheat flour (atta)", 60, "atta"), ml("Water", 35), tsp("Oil", 0.5, "oil")],
    steps: ["Knead atta with water and salt to a soft dough; rest 20 minutes.", "Roll into thin rounds.", "Cook on a hot tawa, flipping once.", "Puff over flame and brush with ghee."],
  },
  {
    id: "aloo-paratha", name: "Aloo Paratha", blurb: "Whole-wheat flatbread stuffed with spiced mashed potato.",
    region: "North Indian", course: "Breakfast", veg: true, prepMin: 25, cookMin: 20, difficulty: "medium", image: "Triangle_paratha_(cropped).JPG",
    ingredients: [g("Wheat flour (atta)", 60, "atta"), g("Potato", 100, "potato"), pc("Green chilli", 1), tsp("Ajwain", 0.25), tbsp("Ghee", 1, "ghee")],
    steps: ["Knead an atta dough and rest.", "Mash boiled potato with chilli, coriander, amchur and salt.", "Stuff a dough ball with the filling and roll flat.", "Cook on tawa with ghee until golden; serve with curd."],
  },
  {
    id: "poori", name: "Poori Masala", blurb: "Puffed deep-fried wheat bread with a mild potato masala.",
    region: "Pan-Indian", course: "Breakfast", veg: true, prepMin: 20, cookMin: 25, difficulty: "medium", image: "Fluffy_Poori_(cropped).JPG",
    ingredients: [g("Wheat flour (atta)", 60, "atta"), g("Potato", 100, "potato"), g("Onion", 30, "onion"), ml("Sunflower oil", 40, "oil"), tsp("Turmeric", 0.25)],
    steps: ["Knead a stiff atta dough with a little oil and salt.", "Cook potato masala with onion, green chilli and turmeric.", "Roll small rounds and deep fry in hot oil, pressing so they puff.", "Serve immediately."],
  },
  {
    id: "poha", name: "Kanda Poha", blurb: "Flattened rice tossed with onion, peanuts and turmeric.",
    region: "Pan-Indian", course: "Breakfast", veg: true, prepMin: 10, cookMin: 10, difficulty: "easy", image: "Indian_breakfast-_Poha.jpg",
    ingredients: [g("Thick poha", 60), g("Onion", 40, "onion"), tbsp("Peanuts", 1), tsp("Mustard seeds", 0.5), tsp("Turmeric", 0.25), ml("Sunflower oil", 8, "oil")],
    steps: ["Rinse poha in a colander and rest 5 minutes.", "Temper mustard, peanuts, chilli, curry leaves and onion.", "Add turmeric, salt, sugar and the poha; toss gently.", "Steam covered for 2 minutes; finish with lemon and coriander."],
  },
  {
    id: "dhokla", name: "Khaman Dhokla", blurb: "Steamed, spongy gram-flour cake with a mustard-sesame tempering.",
    region: "Pan-Indian", course: "Snack", veg: true, prepMin: 10, cookMin: 15, difficulty: "medium", image: "Dhokla_on_Gujrart.jpg",
    ingredients: [g("Besan", 50), ml("Curd", 30, "curd"), tsp("Fruit salt (Eno)", 0.5), tsp("Sugar", 1, "sugar"), tsp("Mustard seeds", 0.5)],
    steps: ["Whisk besan, curd, sugar, salt and water into a smooth batter.", "Stir in fruit salt just before steaming.", "Steam in a greased tin for 12 minutes.", "Pour over a tempering of mustard, curry leaves and chilli; cut into squares."],
  },
  {
    id: "samosa", name: "Punjabi Samosa", blurb: "Flaky pastry triangles filled with spiced potato and peas.",
    region: "North Indian", course: "Snack", veg: true, prepMin: 40, cookMin: 25, difficulty: "hard", image: "Samosas,_snack_food_at_Wikipedia's_16th_Birthday_celebration_in_Chittagong_(01).jpg",
    ingredients: [g("Maida", 50), g("Potato", 100, "potato"), g("Green peas", 20), tsp("Coriander seeds", 1), tsp("Ajwain", 0.25), ml("Sunflower oil", 50, "oil")],
    steps: ["Make a firm dough of maida, oil, ajwain and salt; rest 30 minutes.", "Cook potato and peas with crushed coriander, chilli and amchur.", "Roll ovals, cut in half, shape cones and fill.", "Fry on low heat until golden and blistered."],
  },
  {
    id: "vada-pav", name: "Vada Pav", blurb: "Mumbai's potato fritter in a soft bun with dry garlic chutney.",
    region: "Pan-Indian", course: "Snack", veg: true, prepMin: 25, cookMin: 15, difficulty: "medium", image: "Vada_Pav-Indian_street_food.JPG",
    ingredients: [g("Potato", 120, "potato"), pc("Pav", 2), g("Besan", 30), tsp("Garlic", 1), pc("Green chilli", 1), ml("Sunflower oil", 30, "oil")],
    steps: ["Mash boiled potato with tempered mustard, garlic, chilli and turmeric; shape balls.", "Dip in a besan batter and deep fry until golden.", "Split pav, spread green and garlic chutney.", "Sandwich the vada inside."],
  },
  {
    id: "pav-bhaji", name: "Pav Bhaji", blurb: "Butter-laden mashed vegetable curry with toasted pav.",
    region: "Pan-Indian", course: "Main", veg: true, prepMin: 20, cookMin: 30, difficulty: "medium", image: "Bambayya_Pav_bhaji.jpg",
    ingredients: [g("Potato", 100, "potato"), g("Tomato", 80, "tomato"), g("Onion", 40, "onion"), g("Cauliflower", 60), tbsp("Butter", 1), tsp("Pav bhaji masala", 1.5), pc("Pav", 2)],
    steps: ["Boil potato, cauliflower and peas until soft.", "Cook onion, tomato and capsicum in butter with pav bhaji masala.", "Add the boiled vegetables and mash on the pan.", "Toast pav in butter and serve with onion and lemon."],
  },
  {
    id: "gulab-jamun", name: "Gulab Jamun", blurb: "Milk-solid dumplings soaked in cardamom-rose syrup.",
    region: "Pan-Indian", course: "Dessert", veg: true, prepMin: 20, cookMin: 30, difficulty: "medium", image: "Gulab-jamun-wallpaper-1.jpg",
    ingredients: [g("Milk powder", 30), tbsp("Maida", 1), ml("Milk", 20, "milk"), g("Sugar", 60, "sugar"), ml("Sunflower oil", 40, "oil"), tsp("Cardamom", 0.25)],
    steps: ["Mix milk powder, maida and milk into a soft dough; make smooth balls.", "Boil sugar, water and cardamom into a light syrup.", "Fry the balls on very low heat until deep golden.", "Soak in warm syrup for at least an hour."],
  },
  {
    id: "rasgulla", name: "Rasgulla", blurb: "Spongy chhena balls in light sugar syrup.",
    region: "Pan-Indian", course: "Dessert", veg: true, prepMin: 30, cookMin: 25, difficulty: "hard", image: "Rasgulla.jpg",
    ingredients: [ml("Milk", 300, "milk"), tbsp("Lemon juice", 1), g("Sugar", 60, "sugar"), tsp("Cardamom", 0.25)],
    steps: ["Curdle boiling milk with lemon juice and drain the chhena in muslin.", "Knead the chhena for 8 minutes until smooth; shape balls.", "Simmer the balls in sugar syrup for 15 minutes.", "Cool in the syrup so they stay soft."],
  },
];

// ── Pantry matching ────────────────────────────────────────────────────────
// Scanned bills create inventory items with names like "Paneer" or "Toor Dal",
// so main ingredients are matched by keyword. Spices, salt and other staples
// carry no key and are assumed to be in the kitchen.

const KEY_RULES: Array<[RegExp, string]> = [
  [/toor|arhar/i, "toor|arhar|tur dal"],
  [/rice flour|puttu rice/i, "rice flour"],
  [/urad/i, "urad"],
  [/moong/i, "moong"],
  [/chickpea|chana/i, "chickpea|chana|kabuli"],
  [/rajma/i, "rajma|kidney"],
  [/rava|semolina/i, "rava|semolina|sooji"],
  [/besan/i, "besan|gram flour"],
  [/maida/i, "maida|refined flour"],
  [/poha/i, "poha|flattened rice"],
  [/paneer/i, "paneer"],
  [/^cream$/i, "cream"],
  [/butter/i, "butter"],
  [/fish/i, "fish"],
  [/mutton/i, "mutton|lamb"],
  [/grated coconut/i, "coconut"],
  [/cauliflower/i, "cauliflower|gobi"],
  [/spinach/i, "spinach|palak"],
  [/okra/i, "okra|bhindi"],
  [/cabbage/i, "cabbage"],
  [/green peas/i, "peas"],
  [/capsicum/i, "capsicum|bell pepper"],
  [/aubergine/i, "aubergine|brinjal|eggplant"],
  [/cashew/i, "cashew"],
  [/peanut/i, "peanut|groundnut"],
  [/^pav$/i, "pav|bun"],
  [/milk powder/i, "milk powder"],
  [/corn flour/i, "corn flour|cornflour|cornstarch"],
];

function applyKeys(recipe: CatalogRecipe): CatalogRecipe {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ing) => {
      const rule = KEY_RULES.find(([re]) => re.test(ing.name));
      // Toor dal is explicit so a urad or moong pantry item never satisfies it.
      if (rule && (!ing.key || rule[1].startsWith("toor"))) return { ...ing, key: rule[1] };
      return ing;
    }),
  };
}

export const recipeCatalog: CatalogRecipe[] = rawRecipes.map(applyKeys);

export function findCatalogRecipe(id: string): CatalogRecipe | undefined {
  return recipeCatalog.find((r) => r.id === id);
}

/** True when an inventory item name satisfies an ingredient key ("a|b" means either). */
export function matchesKey(key: string, itemName: string): boolean {
  const name = itemName.toLowerCase();
  return key.split("|").some((alt) => {
    if (!name.includes(alt)) return false;
    // "rice" must not pick up rice flour, and "butter" must not pick up peanut butter or buttermilk.
    if (alt === "rice" && name.includes("flour")) return false;
    if (alt === "butter" && /peanut|milk/.test(name)) return false;
    return true;
  });
}

export type QuantityKind = "mass" | "volume" | "count" | "either";

/** An ingredient's amount in base units (g, ml or count). Spoons count as 5 / 15 of either. */
export function ingredientBase(ing: CatalogIngredient, servings: number): { qty: number; kind: QuantityKind } {
  const total = ing.qty * servings;
  switch (ing.unit) {
    case "g":
      return { qty: total, kind: "mass" };
    case "ml":
      return { qty: total, kind: "volume" };
    case "pc":
      return { qty: total, kind: "count" };
    case "tsp":
      return { qty: total * 5, kind: "either" };
    case "tbsp":
      return { qty: total * 15, kind: "either" };
  }
}
