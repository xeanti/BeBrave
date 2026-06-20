# MotoFix — Web App

A web platform for motorcycle service booking, parts customization, and AI-powered
appearance preview, built with React + Vite + Tailwind CSS + Supabase.

---

## 🚀 Setup Instructions

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Create your Supabase project

1. Go to https://supabase.com and create a free account
2. Click **New Project**, name it `motofix`, set a database password, choose a region (e.g., Singapore)
3. Wait ~2 minutes for it to provision

### 3. Set up the database

1. In your Supabase project, go to **SQL Editor**
2. Open `supabase/schema.sql` from this project
3. Copy the entire contents and paste it into the SQL Editor
4. Click **Run** — this creates all tables (profiles, services, bookings, parts, customizations, chat)

### 4. Create Storage buckets

1. Go to **Storage** in your Supabase dashboard
2. Create a new bucket called `motorcycle-photos` → set **Public bucket** to ON
3. Create another bucket called `ai-previews` → set **Public bucket** to ON

### 5. Get your API keys

1. Go to **Project Settings > API**
2. Copy your **Project URL** and **anon public** key

### 6. Configure environment variables

```bash
cd frontend
cp .env.example .env
```

Edit `.env` and paste in your values:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 7. Run the app

```bash
npm run dev
```

Visit **http://localhost:5173**

---

## 🤖 Setting up the AI Appearance Preview (Gemini)

The AI preview feature requires a Supabase Edge Function (server-side, so your Gemini
API key stays secret).

### Install Supabase CLI

```bash
npm install -g supabase
```

### Login & link your project

```bash
supabase login
supabase link --project-ref your-project-ref
```

### Get a Gemini API key

1. Go to https://aistudio.google.com/app/apikey
2. Create a free API key

### Set secrets

```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> ⚠️ The Service Role Key is found in **Project Settings > API > service_role** —
> keep this secret, never put it in frontend code.

### Deploy the function

```bash
supabase functions deploy generate-preview
```

---

## 📂 Project Structure

```
frontend/
├── src/
│   ├── components/      # Navbar, ProtectedRoute
│   ├── context/         # AuthContext (Supabase auth)
│   ├── lib/              # Supabase client
│   ├── pages/            # Landing, Login, Register, Dashboard, Booking, Customize
│   ├── App.jsx           # Routes
│   └── main.jsx
├── supabase/
│   ├── schema.sql        # Database schema + RLS policies
│   └── functions/
│       └── generate-preview/  # Edge Function for Gemini AI image generation
├── .env.example
└── package.json
```

---

## ✅ What's Already Built

- [x] User registration & login (Supabase Auth)
- [x] Role-based profiles (customer / mechanic / admin)
- [x] Landing page
- [x] Customer dashboard
- [x] Service booking form
- [x] AI Motorcycle Appearance Preview page (photo upload + part selection + Gemini integration)
- [x] Database schema for bookings, parts, customizations, chat

## 🔜 Next Steps (Suggested Order)

1. Add sample data to `services` and `parts` tables via Supabase Table Editor
2. Test registration/login flow
3. Test the booking form
4. Add Gemini API key and test the AI preview feature
5. Build mechanic dashboard (view assigned bookings)
6. Build admin dashboard (manage services, parts, view all bookings)
7. Build in-app chat (chat_conversations + chat_messages tables already created)
8. Add AI chatbot assistant
9. Add push notifications (Firebase Cloud Messaging)
10. Build the React Native mobile app (can reuse Supabase setup)
