export enum SlackNode {
  ACCESS_PROXY = "Access Proxy",
  ANALYTICS = "Analytics",
  AI = "Artificial intelligence",
  CODEBASE = "Codebase",
  DATA_STORE = "Data Store",
  DATABASE = "Database",
  DOMAIN_HOST = "Domain Host",
  FINANCE = "Finance",
  HOSTING_SERVER = "Hosting Server",
  HUMAN_RESOURCE = "Human Resource",
  LOAD_BALANCER = "Load Balancer",
  PAYMENT = "Payment",
  PROCESSING_SERVER = "Processing Server",
  TELEPHONY = "Telephony",
  MESSAGING = "Messaging",
  USER_MANAGEMENT = "User Management",
  APPLICATION = "Application",
}

export enum SlackProvider {
  // Access Proxy
  SMART_PROXY = "Smart Proxy",
  DECODO = "Decodo",
  PACKETSTREAM = "PacketStream",
  IP_ROYAL = "IP Royal",

  // Analytics
  CLARITY = "Clarity",

  // AI
  CHATGPT = "ChatGPT",
  GEMINI = "Gemini",
  DEEPSEEK = "DeepSeek",
  DIGITAL_OCEAN_AI = "Digital Ocean",

  // Codebase
  GITHUB = "GitHub",

  // Data Store
  FIREBASE = "Firebase",

  // Database
  MONGODB = "MongoDB",
  MYSQL = "MySQL",
  POSTGRESQL = "PostgreSQL",

  // Domain Host
  NAMECHEAP = "Namecheap",

  // Finance
  ZOHO_BOOKS = "Zoho Books",

  // Hosting Server
  VERCEL = "Vercel",
  RENDER = "Render",

  // Human Resource
  HUBSTAFF = "Hubstaff",

  // Load Balancer
  REDIS = "Redis",

  // Payment
  STRIPE = "Stripe",
  PAYPAL = "Paypal",
  PAYSTACK = "Paystack", // Adding Paystack as it's used in the codebase

  // Processing Server
  DIGITAL_OCEAN = "Digital Ocean",

  // Telephony
  JUSTCALL = "JustCall",

  // Messaging
  SLACK = "Slack",
  SENDGRID = "SendGrid",
  SYSTEM = "System",

  NA = "N/A",
}

export enum SlackSeverity {
  INFO = "INFO",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
}

export enum SlackEventType {
  USER_REGISTRATION = "USER_REGISTRATION",
  EMAIL_VERIFICATION = "EMAIL_VERIFICATION",
  PAYMENT_SUCCESS = "PAYMENT_SUCCESS",
  PAYMENT_FAILURE = "PAYMENT_FAILURE",
  PAYMENT_ATTEMPT = "PAYMENT_ATTEMPT",
  SUBSCRIPTION_UPDATE = "SUBSCRIPTION_UPDATE",
  SUBSCRIPTION_CANCEL = "SUBSCRIPTION_CANCEL",
  MANUAL_APPLICATION = "MANUAL_APPLICATION",
  AUTO_APPLICATION = "AUTO_APPLICATION",
  PROFILE_UPDATE = "PROFILE_UPDATE",
  PROFILE_CREATION = "PROFILE_CREATION",
  DOCUMENT_UPLOAD = "DOCUMENT_UPLOAD",
  DOCUMENT_UPDATE = "DOCUMENT_UPDATE",
  JOB_PREFERENCE_UPDATE = "JOB_PREFERENCE_UPDATE",
  APPLICATION_PAUSE = "APPLICATION_PAUSE",
  APPLICATION_RESUME = "APPLICATION_RESUME",
  REFERRAL_SIGNUP = "REFERRAL_SIGNUP",
  CONTACT_CREATION = "CONTACT_CREATION",
  MISSING_INFO = "MISSING_INFO",
  ADMIN_ACTION = "ADMIN_ACTION",
  CRON_EXECUTION = "CRON_EXECUTION",
  ERROR_ALERT = "ERROR_ALERT",
  SYSTEM_NOTIFICATION = "SYSTEM_NOTIFICATION",
  USER_TRIGGERED = "USER_TRIGGERED",
  SUPPORT_MESSAGE = "SUPPORT_MESSAGE",
}

export enum SlackChannel {
  CRY_WOLF = "C06JUAXP73P",
  CHANGE_REQUESTS = "C07BBMUMMFX",
  TOWN_CRIER = "C0603SL8QJ0",
  DEPLOYMENTS_LOGS = "C04FA0YU72A",
  TEST_NOTIFICATIONS="",
  // PAYMENTS = 'C077H6PBBFS',
  // VA = 'C04FYK43Q2D',
  VA = "C09HJKSS42E",
  FREE_TRIALS = "C08PWPTA8FM",
  PAID_SUB = "C077H6PBBFS", // Replace with actual paid-sub channel ID
}

export enum SlackLocation {
  LOCALHOST = "localhost",
  STAGING = "staging",
  PRODUCTION = "production",
}