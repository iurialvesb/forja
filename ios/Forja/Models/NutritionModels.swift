import Foundation

struct MacroSet: Codable, Hashable {
    var kcal: Double; var protein: Double; var carbs: Double; var fat: Double
    var fiber: Double?; var vitCMg: Double?; var magnesiumMg: Double?
    static let zero = MacroSet(kcal: 0, protein: 0, carbs: 0, fat: 0)
}

struct MealIngredient: Codable, Hashable, Identifiable {
    var id: String { foodId + name }
    var foodId: String; var name: String; var grams: Double; var role: String
    var minGrams: Double?; var maxGrams: Double?; var fixed: Bool?
}

struct NutritionAlert: Codable, Hashable { let level: String; let date: String; let slot: String?; let message: String }

struct DayTargetDTO: Codable, Hashable { let date: String; let macros: MacroSet; let load: String; let trainingKcal: Double; let tdee: Double; let explanation: [String] }

struct MealDTO: Codable, Hashable, Identifiable {
    let id: String; let date: String; let slot: String; let recipeId: String?; var title: String
    var ingredients: [MealIngredient]; var status: String; var locked: Bool?; let fromBatch: Bool?; let macros: MacroSet
}

struct MealAdjustmentDTO: Codable, Hashable { let mealId: String; let slot: String; let title: String; let text: String }
struct AdherenceDTO: Codable, Hashable { let mealsDone: Int; let mealsTotal: Int; let score: Int }

struct NutritionDay: Codable, Hashable, Identifiable {
    var id: String { date }
    let date: String; let target: DayTargetDTO; let totals: MacroSet; let eaten: MacroSet; let alerts: [NutritionAlert]; let meals: [MealDTO]
    var adjustments: [MealAdjustmentDTO]? ; var adherence: AdherenceDTO?
}

struct ShoppingItemDTO: Codable, Hashable, Identifiable {
    var id: String { foodId }
    let foodId: String; let name: String; let aisle: String; let needG: Double; let haveG: Double; let buyG: Double; let buyUnits: Int?; let firstNeeded: String; let note: String?
}
struct ShoppingListDTO: Decodable {
    let weekStart: String; let shoppingDate: String?; let items: [ShoppingItemDTO]; let coveredByStock: [NameGrams]; let checked: [String]?; let note: String?
}

struct SupplementRecDTO: Codable, Hashable, Identifiable { let id: String; let name: String; let take: Bool; let when: String?; let reason: String; let supplementId: String? }

struct BatchTaskDTO: Codable, Hashable { let start: Double; let end: Double; let recipe: String; let text: String; let hands: String; let equipment: String? }
struct ContainerDTO: Codable, Hashable { let label: String; let date: String; let slot: String; let recipe: String; let contents: [NameGrams]; let storage: String; let note: String? }
struct NameGrams: Codable, Hashable { let name: String; let grams: Double }
struct BatchPlanDTO: Codable, Hashable { let cookDate: String; let totalMinutes: Double; let tasks: [BatchTaskDTO]; let containers: [ContainerDTO]; let totals: [RecipeTotal]; let warnings: [String] }
struct RecipeTotal: Codable, Hashable { let recipe: String; let ingredients: [NameGrams] }
struct ShoppingLine: Codable, Hashable, Identifiable { var id: String { foodId }; let foodId: String; let name: String; let needG: Double; let haveG: Double; let buyG: Double }

struct NutritionWeek: Codable {
    struct Settings: Codable { let mode: String; let mealSlots: [String] }
    struct Balance: Codable { let deltaKcal: Double; let deltaProtein: Double; let message: String? }
    struct Supps: Codable { let recs: [SupplementRecDTO]; let notes: [String] }
    struct Expiring: Codable, Hashable { let id: String; let name: String; let location: String; let expiresOn: String? }
    let settings: Settings; let days: [NutritionDay]; let balance: Balance; let supplements: Supps
    let expiringSoon: [Expiring]; let batchPlan: BatchPlanDTO?; let shopping: [ShoppingLine]
}

struct LoggedItem: Codable, Hashable, Identifiable { var id: String { foodId }; let foodId: String; var name: String; var grams: Double; let gramsConfidence: String?; let macros: MacroSet?; let source: String? }

struct PantryRow: Codable, Hashable, Identifiable {
    var id: String?; var userId: String?; var name: String; var foodId: String?; var location: String
    var quantityG: Double?; var units: Double?; var unitGrams: Double?; var expiresOn: String?
}
struct ParsedPantryItem: Codable, Hashable, Identifiable {
    var id = UUID()
    var name: String; var queryEn: String?; var location: String; var locationGuessed: Bool?; var quantityG: Double?; var units: Double?; var unitGrams: Double?; var expiresOn: String?
    enum CodingKeys: String, CodingKey { case name, queryEn, location, locationGuessed, quantityG, units, unitGrams, expiresOn }
}

struct SupplementRow: Codable, Hashable, Identifiable { var id: String?; var userId: String?; var kind: String; var name: String; var doseText: String; var stock: Int?; var active: Bool = true }

struct NutritionSettingsRow: Codable {
    var userId: String?
    var mode: String = "mantenimiento"
    var rateKgPerWeek: Double?
    var proteinGPerKg: Double?
    var activityFactor: Double = 1.4
    var mealSlots: [String] = ["desayuno", "comida", "merienda", "cena"]
    var batchDay: Int = 7
    var dislikes: [String] = []
    var intolerances: [String] = []
    var maxSupplementsPerDay: Int?
    var notify: Bool = true
    var compensate: Bool = false
    var shoppingDay: Int = 6
}

enum Slots {
    static let all = ["desayuno", "media_manana", "pre_entreno", "comida", "merienda", "post_entreno", "cena", "recena"]
    static func name(_ s: String) -> String { ["desayuno": "Desayuno", "media_manana": "Media mañana", "pre_entreno": "Pre-entreno", "comida": "Comida", "merienda": "Merienda", "post_entreno": "Post-entreno", "cena": "Cena", "recena": "Recena"][s] ?? s }
    static func hour(_ s: String) -> (Int, Int) { ["desayuno": (8, 0), "media_manana": (11, 0), "pre_entreno": (17, 30), "comida": (14, 0), "merienda": (17, 30), "post_entreno": (20, 0), "cena": (21, 0), "recena": (22, 30)][s] ?? (12, 0) }
}

enum GoalModes {
    static let all: [(String, String)] = [("definicion", "Definir (perder grasa)"), ("mantenimiento", "Mantener"), ("volumen", "Ganar masa muscular"), ("recomposicion", "Recomposición"), ("rendimiento", "Rendimiento (competición)")]
    static func name(_ m: String) -> String { all.first { $0.0 == m }?.1 ?? m }
}
