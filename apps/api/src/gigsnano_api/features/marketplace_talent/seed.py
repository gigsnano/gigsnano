"""Single source of truth for the marketplace catalog seed. Faithful port of the
frontend fixtures (gigsnano-v2 src/mocks/data/marketplace.ts). Consumed by the
Alembic data migration (prod) and seed_marketplace() (tests)."""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import (
    EExperienceLevel,
    EJobType,
    ETalentBadge,
    Freelancer,
    MarketplaceJob,
)


def _dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone.utc)


MARKETPLACE_JOBS: list[dict] = [
    {
        "id": "mj-1", "sort_order": 1,
        "title": "Full Stack Developer Needed for Small Web Application Improvements",
        "description": (
            "We are looking for a reliable full stack developer to help with a small web application.\n\n"
            "Scope of work:\n- Fix a few UI issues in the frontend\n- Implement 1-2 small backend API changes\n"
            "- Connect frontend with backend where needed\n- Test the changes and ensure everything works correctly\n\n"
            "Requirements:\n- Experience with React and Node.js\n- Good understanding of REST APIs\n"
            "- Familiarity with Git\n- Strong communication and attention to detail\n\n"
            "This is a small starter project with the potential for additional work if the collaboration goes well."
        ),
        "posted_at": _dt("2026-07-01T09:00:00Z"),
        "job_type": EJobType.HOURLY, "hourly_min": 25, "hourly_max": 50, "fixed_budget": None,
        "experience_level": EExperienceLevel.EXPERT, "duration_label": "Less than 1 month",
        "hours_per_week_label": "Less than 30 hrs/week", "category": "Web Development",
        "skills": ["React", "Node.js", "TypeScript", "REST APIs", "Web Development"],
        "proposals_label": "50+", "interviewing": 5, "invites_sent": 0,
        "client_payment_verified": True, "client_rating": 5.0, "client_reviews_count": 11,
        "client_total_spent_usd": 2300, "client_avg_hourly_paid": 30, "client_hires": 11,
        "client_country": "Norway", "client_jobs_posted": 7, "client_hire_rate_pct": 100,
        "client_industry": "Tech & IT", "client_company_size": "Small company (2-9 people)",
        "client_member_since": "May 2024",
    },
    {
        "id": "mj-2", "sort_order": 2,
        "title": "Front End Developer for Cybersecurity Training Platform",
        "description": (
            "We're looking for a frontend contractor to continue work on an IT and cybersecurity training "
            "platform built in Next.js and TypeScript, deployed via Vercel.\n\n"
            "You need to have:\n- Next.js and TypeScript production experience\n"
            "- A sharp eye for pixel-perfect implementation from Figma\n"
            "- Comfort working in an existing codebase with review workflows\n\n"
            "Ongoing engagement, 30+ hrs/week for the right person."
        ),
        "posted_at": _dt("2026-07-02T14:30:00Z"),
        "job_type": EJobType.HOURLY, "hourly_min": 25, "hourly_max": 50, "fixed_budget": None,
        "experience_level": EExperienceLevel.EXPERT, "duration_label": "More than 6 months",
        "hours_per_week_label": "30+ hrs/week", "category": "Web Development",
        "skills": ["Next.js", "TypeScript", "CSS", "Figma", "Front-End Development"],
        "proposals_label": "50+", "interviewing": 8, "invites_sent": 2,
        "client_payment_verified": True, "client_rating": 5.0, "client_reviews_count": 34,
        "client_total_spent_usd": 90000, "client_avg_hourly_paid": 38, "client_hires": 27,
        "client_country": "United States", "client_jobs_posted": 41, "client_hire_rate_pct": 78,
        "client_industry": "Education", "client_company_size": "Mid-sized company (10-99 people)",
        "client_member_since": "Jan 2021",
    },
    {
        "id": "mj-3", "sort_order": 3,
        "title": "React/Next.js + Supabase App Developer",
        "description": (
            "I've been building a web app on my own using Next.js and Supabase, and I've got working code but "
            "it's not doing what I need.\n\n"
            "A few things are broken or half-implemented and I've hit a wall trying to fix them myself. "
            "Looking for someone who can dive into an unfamiliar codebase, diagnose quickly, and ship fixes."
        ),
        "posted_at": _dt("2026-07-03T08:40:00Z"),
        "job_type": EJobType.FIXED, "hourly_min": None, "hourly_max": None, "fixed_budget": 100,
        "experience_level": EExperienceLevel.INTERMEDIATE, "duration_label": "Less than 1 month",
        "hours_per_week_label": "Less than 30 hrs/week", "category": "Web Development",
        "skills": ["React", "Next.js", "Supabase", "JavaScript", "Debugging"],
        "proposals_label": "15 to 20", "interviewing": 2, "invites_sent": 0,
        "client_payment_verified": True, "client_rating": 0, "client_reviews_count": 0,
        "client_total_spent_usd": 0, "client_avg_hourly_paid": None, "client_hires": 0,
        "client_country": "United Kingdom", "client_jobs_posted": 1, "client_hire_rate_pct": 0,
        "client_industry": "Retail & Consumer Goods", "client_company_size": "Individual client",
        "client_member_since": "Jun 2026",
    },
    {
        "id": "mj-4", "sort_order": 4,
        "title": "AI Chatbot Developer (Vercel AI SDK, OpenAI Integration)",
        "description": (
            "We need an experienced developer to build an AI-powered support chatbot for our e-commerce store.\n\n"
            "Deliverables:\n- Chat widget embedded on our storefront\n- Retrieval over our help-center articles\n"
            "- Handoff to a human when the bot is unsure\n\n"
            "Experience with the Vercel AI SDK, streaming responses, and prompt design is required. "
            "Bonus for prior e-commerce work."
        ),
        "posted_at": _dt("2026-06-29T17:15:00Z"),
        "job_type": EJobType.HOURLY, "hourly_min": 40, "hourly_max": 75, "fixed_budget": None,
        "experience_level": EExperienceLevel.EXPERT, "duration_label": "1 to 3 months",
        "hours_per_week_label": "Less than 30 hrs/week", "category": "AI Development",
        "skills": ["AI Development", "Next.js", "OpenAI API", "TypeScript", "Vercel AI SDK", "E-Commerce"],
        "proposals_label": "20 to 50", "interviewing": 4, "invites_sent": 3,
        "client_payment_verified": True, "client_rating": 4.9, "client_reviews_count": 18,
        "client_total_spent_usd": 12400, "client_avg_hourly_paid": 45, "client_hires": 14,
        "client_country": "Canada", "client_jobs_posted": 19, "client_hire_rate_pct": 84,
        "client_industry": "Retail & Consumer Goods", "client_company_size": "Small company (2-9 people)",
        "client_member_since": "Mar 2022",
    },
    {
        "id": "mj-5", "sort_order": 5,
        "title": "Dashboard UI Revamp for Internal Analytics Tool (Ongoing Work)",
        "description": (
            "We're looking for a skilled frontend developer to help revamp the frontend of our internal "
            "analytics dashboard.\n\n"
            "The current UI is functional but outdated, and we need someone who can modernize it, improve "
            "performance, and implement a cleaner component system.\n\n"
            "You'll work directly with our product designer. Charts experience (Recharts or similar) "
            "strongly preferred."
        ),
        "posted_at": _dt("2026-07-02T11:05:00Z"),
        "job_type": EJobType.HOURLY, "hourly_min": 20, "hourly_max": 40, "fixed_budget": None,
        "experience_level": EExperienceLevel.INTERMEDIATE, "duration_label": "Less than 1 month",
        "hours_per_week_label": "Less than 30 hrs/week", "category": "Web Development",
        "skills": ["React", "Data Visualization", "Tailwind CSS", "UI/UX Design", "Recharts"],
        "proposals_label": "50+", "interviewing": 3, "invites_sent": 1,
        "client_payment_verified": True, "client_rating": 0, "client_reviews_count": 0,
        "client_total_spent_usd": 0, "client_avg_hourly_paid": None, "client_hires": 0,
        "client_country": "Sri Lanka", "client_jobs_posted": 2, "client_hire_rate_pct": 0,
        "client_industry": "Tech & IT", "client_company_size": "Small company (2-9 people)",
        "client_member_since": "Feb 2026",
    },
    {
        "id": "mj-6", "sort_order": 6,
        "title": "Fix a Small UI Issue in a React.js Application",
        "description": (
            "We are looking for an experienced React.js developer to fix a small UI issue in our existing "
            "web application.\n\n"
            "Responsibilities:\n- Fix a layout issue in the existing React.js application\n"
            "- Resolve responsive design problems across breakpoints\n\n"
            "Quick task for someone who knows flexbox/grid inside out."
        ),
        "posted_at": _dt("2026-07-02T16:45:00Z"),
        "job_type": EJobType.FIXED, "hourly_min": None, "hourly_max": None, "fixed_budget": 5,
        "experience_level": EExperienceLevel.INTERMEDIATE, "duration_label": "Less than 1 month",
        "hours_per_week_label": "Less than 30 hrs/week", "category": "Web Development",
        "skills": ["React", "CSS", "HTML", "Responsive Design"],
        "proposals_label": "50+", "interviewing": 1, "invites_sent": 0,
        "client_payment_verified": True, "client_rating": 5.0, "client_reviews_count": 42,
        "client_total_spent_usd": 10500, "client_avg_hourly_paid": 22, "client_hires": 39,
        "client_country": "United States", "client_jobs_posted": 55, "client_hire_rate_pct": 71,
        "client_industry": "Marketing & Advertising", "client_company_size": "Individual client",
        "client_member_since": "Aug 2020",
    },
    {
        "id": "mj-7", "sort_order": 7,
        "title": "B2B SaaS Web Application MVP (React / Node.js)",
        "description": (
            "We are looking for an experienced full-stack developer or small team to build the MVP of a B2B "
            "SaaS web application for electrical product distributors.\n\n"
            "The platform will streamline the complete order management workflow — catalog, quotes, orders, "
            "and fulfilment tracking.\n\n"
            "We have full designs ready in Figma and a written functional spec. You estimate, we iterate weekly."
        ),
        "posted_at": _dt("2026-06-27T10:20:00Z"),
        "job_type": EJobType.HOURLY, "hourly_min": 15, "hourly_max": 35, "fixed_budget": None,
        "experience_level": EExperienceLevel.INTERMEDIATE, "duration_label": "3 to 6 months",
        "hours_per_week_label": "30+ hrs/week", "category": "Web Development",
        "skills": ["React", "Node.js", "PostgreSQL", "SaaS", "Full-Stack Development"],
        "proposals_label": "20 to 50", "interviewing": 6, "invites_sent": 4,
        "client_payment_verified": True, "client_rating": 5.0, "client_reviews_count": 7,
        "client_total_spent_usd": 1800, "client_avg_hourly_paid": 28, "client_hires": 5,
        "client_country": "Canada", "client_jobs_posted": 6, "client_hire_rate_pct": 83,
        "client_industry": "Manufacturing & Construction", "client_company_size": "Mid-sized company (10-99 people)",
        "client_member_since": "Nov 2023",
    },
    {
        "id": "mj-8", "sort_order": 8,
        "title": "Brand Identity & Landing Page Design for Fintech Startup",
        "description": (
            "Early-stage fintech startup needs a complete brand identity and a high-converting landing page "
            "design.\n\n"
            "Deliverables:\n- Logo + brand guidelines (colors, type, voice)\n"
            "- Landing page design in Figma (desktop + mobile)\n- Component library for the marketing site\n\n"
            "We love clean, editorial design — think Linear, Stripe, Mercury. Portfolio required."
        ),
        "posted_at": _dt("2026-06-30T13:00:00Z"),
        "job_type": EJobType.FIXED, "hourly_min": None, "hourly_max": None, "fixed_budget": 2500,
        "experience_level": EExperienceLevel.EXPERT, "duration_label": "1 to 3 months",
        "hours_per_week_label": "Less than 30 hrs/week", "category": "Design & Creative",
        "skills": ["UI/UX Design", "Figma", "Brand Identity", "Landing Page", "Web Design"],
        "proposals_label": "20 to 50", "interviewing": 5, "invites_sent": 6,
        "client_payment_verified": True, "client_rating": 4.8, "client_reviews_count": 9,
        "client_total_spent_usd": 21000, "client_avg_hourly_paid": 65, "client_hires": 8,
        "client_country": "Singapore", "client_jobs_posted": 12, "client_hire_rate_pct": 75,
        "client_industry": "Finance & Accounting", "client_company_size": "Small company (2-9 people)",
        "client_member_since": "Sep 2022",
    },
    {
        "id": "mj-9", "sort_order": 9,
        "title": "Data Analyst for Marketing Attribution Deep-Dive",
        "description": (
            "We need a data analyst to untangle our marketing attribution across paid, organic, and referral "
            "channels.\n\n"
            "You'll work with our BigQuery warehouse and Looker Studio dashboards to:\n"
            "- Audit current attribution logic\n- Build a channel-level ROI model\n"
            "- Present findings with clear recommendations\n\n"
            "SQL fluency required; dbt experience a big plus."
        ),
        "posted_at": _dt("2026-06-25T09:30:00Z"),
        "job_type": EJobType.HOURLY, "hourly_min": 35, "hourly_max": 60, "fixed_budget": None,
        "experience_level": EExperienceLevel.EXPERT, "duration_label": "1 to 3 months",
        "hours_per_week_label": "Less than 30 hrs/week", "category": "Data Science & Analytics",
        "skills": ["Data Analysis", "SQL", "BigQuery", "Looker Studio", "Marketing Analytics"],
        "proposals_label": "10 to 15", "interviewing": 2, "invites_sent": 1,
        "client_payment_verified": True, "client_rating": 4.6, "client_reviews_count": 22,
        "client_total_spent_usd": 47000, "client_avg_hourly_paid": 52, "client_hires": 19,
        "client_country": "Germany", "client_jobs_posted": 28, "client_hire_rate_pct": 68,
        "client_industry": "Marketing & Advertising", "client_company_size": "Mid-sized company (10-99 people)",
        "client_member_since": "Apr 2019",
    },
    {
        "id": "mj-10", "sort_order": 10,
        "title": "Technical Writer for Developer Documentation (API + Guides)",
        "description": (
            "Our developer platform needs documentation that developers actually enjoy reading.\n\n"
            "Scope:\n- Rewrite the API reference from OpenAPI specs\n"
            "- Author 6-8 task-based guides (auth, webhooks, pagination, errors)\n"
            "- Establish a style guide for future docs\n\n"
            "You should write code samples yourself (JavaScript + Python) and have shipped docs for a "
            "developer product before."
        ),
        "posted_at": _dt("2026-06-28T15:50:00Z"),
        "job_type": EJobType.HOURLY, "hourly_min": 30, "hourly_max": 55, "fixed_budget": None,
        "experience_level": EExperienceLevel.INTERMEDIATE, "duration_label": "1 to 3 months",
        "hours_per_week_label": "Less than 30 hrs/week", "category": "Writing",
        "skills": ["Technical Writing", "API Documentation", "JavaScript", "Python", "Developer Tools"],
        "proposals_label": "5 to 10", "interviewing": 1, "invites_sent": 2,
        "client_payment_verified": False, "client_rating": 4.4, "client_reviews_count": 5,
        "client_total_spent_usd": 6200, "client_avg_hourly_paid": 40, "client_hires": 4,
        "client_country": "Netherlands", "client_jobs_posted": 9, "client_hire_rate_pct": 44,
        "client_industry": "Tech & IT", "client_company_size": "Small company (2-9 people)",
        "client_member_since": "Jul 2023",
    },
    {
        "id": "mj-11", "sort_order": 11,
        "title": "Mobile-First Marketing Site in Astro or Next.js (Entry Friendly)",
        "description": (
            "Simple 5-page marketing site for a local fitness studio. We have copy and photography ready.\n\n"
            "Pages: home, classes, schedule, pricing, contact (with a form).\n\n"
            "Great starter project — we care about clean semantics, fast load, and a tidy handoff. "
            "We'll provide a Figma file with all layouts."
        ),
        "posted_at": _dt("2026-07-03T07:10:00Z"),
        "job_type": EJobType.FIXED, "hourly_min": None, "hourly_max": None, "fixed_budget": 600,
        "experience_level": EExperienceLevel.ENTRY, "duration_label": "Less than 1 month",
        "hours_per_week_label": "Less than 30 hrs/week", "category": "Web Development",
        "skills": ["HTML", "CSS", "Next.js", "Responsive Design", "Web Design"],
        "proposals_label": "20 to 50", "interviewing": 0, "invites_sent": 0,
        "client_payment_verified": True, "client_rating": 5.0, "client_reviews_count": 3,
        "client_total_spent_usd": 1400, "client_avg_hourly_paid": None, "client_hires": 3,
        "client_country": "Australia", "client_jobs_posted": 4, "client_hire_rate_pct": 75,
        "client_industry": "Health & Fitness", "client_company_size": "Individual client",
        "client_member_since": "Oct 2024",
    },
    {
        "id": "mj-12", "sort_order": 12,
        "title": "Python Scraping Script Maintenance & Data Cleanup (Entry Level)",
        "description": (
            "We run a handful of Python scrapers that collect public pricing data. Two of them broke after "
            "site layout changes.\n\n"
            "Tasks:\n- Fix the two broken scrapers (requests + BeautifulSoup)\n"
            "- Add retry logic and basic logging\n- Deduplicate and normalize the existing CSV output\n\n"
            "Clear acceptance criteria will be provided. Good first project with more scripts to maintain if "
            "it goes well."
        ),
        "posted_at": _dt("2026-06-26T12:00:00Z"),
        "job_type": EJobType.HOURLY, "hourly_min": 10, "hourly_max": 20, "fixed_budget": None,
        "experience_level": EExperienceLevel.ENTRY, "duration_label": "Less than 1 month",
        "hours_per_week_label": "Less than 30 hrs/week", "category": "Data Science & Analytics",
        "skills": ["Python", "Web Scraping", "Data Analysis", "BeautifulSoup"],
        "proposals_label": "50+", "interviewing": 7, "invites_sent": 0,
        "client_payment_verified": True, "client_rating": 4.7, "client_reviews_count": 61,
        "client_total_spent_usd": 8900, "client_avg_hourly_paid": 15, "client_hires": 48,
        "client_country": "United States", "client_jobs_posted": 72, "client_hire_rate_pct": 66,
        "client_industry": "Retail & Consumer Goods", "client_company_size": "Small company (2-9 people)",
        "client_member_since": "Jan 2018",
    },
]

FREELANCERS: list[dict] = [
    {
        "id": "mf-1", "sort_order": 1,
        "name": "Gurpreet S.", "avatar_url": None,
        "title": "Full Stack Developer | React | Next.js | Node.js",
        "country": "India", "city": "Chandigarh", "hourly_rate": 25, "job_success_pct": 100,
        "badge": ETalentBadge.TOP_RATED_PLUS, "total_earned_label": "$1M+", "jobs_count": 99,
        "hours_worked": 30991, "available_now": True,
        "skills": ["React", "Next.js", "Node.js", "TypeScript", "MERN Stack",
                   "Tailwind CSS", "PostgreSQL", "REST APIs"],
        "overview": (
            "Certified full stack developer with 12+ years of experience shipping production "
            "web applications for startups and enterprises.\n\nI specialize in React/Next.js "
            "frontends backed by Node.js APIs, with a focus on performance, scalability, and "
            "maintainable architecture. Recent work includes an investor portal with optimized "
            "existing codebases and a suite of AI-driven web apps."
        ),
        "languages": ["English: Fluent", "Hindi: Native"],
        "verifications": ["ID verified", "Phone verified"],
        "hours_per_week_label": "More than 30 hrs/week", "member_since": "Mar 2014",
        "work_history": [
            {"title": "Software Developer for Fixing React App", "rating": 5.0,
             "period_label": "May 2026 - Jun 2026", "amount_label": "30 hrs @ $25.00/hr",
             "feedback": "Understood the project in full and delivered very quickly. Would work with him again on future projects."},
            {"title": "Full-Stack Developer — Mini App & Smart Farming Platform", "rating": 5.0,
             "period_label": "Feb 2026 - Apr 2026", "amount_label": "Fixed-price $4,200.00",
             "feedback": "Excellent work, I was impressed by the quality and effort provided."},
            {"title": "Senior Backend Engineer — Node.js, MongoDB, Queues", "rating": 4.8,
             "period_label": "Nov 2025 - Jan 2026", "amount_label": "120 hrs @ $25.00/hr",
             "feedback": "Reliable, communicative, and technically sharp. Handled ambiguous requirements gracefully."},
            {"title": "React Developer for Dashboard Revamp", "rating": 5.0,
             "period_label": "Aug 2025 - Oct 2025", "amount_label": "85 hrs @ $22.00/hr",
             "feedback": "It was a pleasure working with him. He did a great job."},
        ],
    },
    {
        "id": "mf-2", "sort_order": 2,
        "name": "Mykhailo D.", "avatar_url": None,
        "title": "Front End Developer | React | Next.js | Performance",
        "country": "Ukraine", "city": "Lviv", "hourly_rate": 39, "job_success_pct": 100,
        "badge": ETalentBadge.TOP_RATED, "total_earned_label": "$400K+", "jobs_count": 64,
        "hours_worked": 9800, "available_now": True,
        "skills": ["React", "Next.js", "Redux", "CSS", "HTML5", "Front-End Development", "TypeScript"],
        "overview": (
            "Frontend engineer with 10+ years of experience. I architect scalable React applications "
            "with performance improvements including LCP under 1.5s and 40% reduced bundle sizes.\n\n"
            "30+ production-grade frontend applications shipped using React, React Hooks, and TypeScript."
        ),
        "languages": ["English: Fluent", "Ukrainian: Native"],
        "verifications": ["ID verified"],
        "hours_per_week_label": "More than 30 hrs/week", "member_since": "Jun 2016",
        "work_history": [
            {"title": "Frontend Developer for SaaS Dashboard", "rating": 5.0,
             "period_label": "Apr 2026 - Jun 2026", "amount_label": "140 hrs @ $39.00/hr",
             "feedback": "Outstanding attention to detail. Our Core Web Vitals went from red to green across the board."},
            {"title": "React Performance Audit & Fixes", "rating": 5.0,
             "period_label": "Jan 2026 - Feb 2026", "amount_label": "Fixed-price $1,800.00",
             "feedback": "Found and fixed re-render issues nobody else could. Highly recommended."},
            {"title": "Next.js Migration for Marketing Site", "rating": 4.9,
             "period_label": "Sep 2025 - Dec 2025", "amount_label": "210 hrs @ $35.00/hr",
             "feedback": "Smooth migration with zero downtime. Great communicator."},
        ],
    },
    {
        "id": "mf-3", "sort_order": 3,
        "name": "Amrita S.", "avatar_url": None,
        "title": "React Developer | SaaS | Node/Next Full Stack",
        "country": "India", "city": "Bengaluru", "hourly_rate": 17, "job_success_pct": 100,
        "badge": ETalentBadge.TOP_RATED, "total_earned_label": "$100K+", "jobs_count": 48,
        "hours_worked": 6200, "available_now": True,
        "skills": ["CSS", "Front-End Development", "React", "Redux", "SaaS Development", "Node.js"],
        "overview": (
            "Full stack developer focused on SaaS products. I optimized application performance in an "
            "invoice management system using React, Node.js, and AWS to improve Core Web Vitals.\n\n"
            "I build scalable SaaS platforms and web applications with a focus on performance and "
            "maintainability."
        ),
        "languages": ["English: Fluent", "Kannada: Native", "Hindi: Fluent"],
        "verifications": ["ID verified", "Phone verified"],
        "hours_per_week_label": "As needed - open to offers", "member_since": "Feb 2019",
        "work_history": [
            {"title": "SaaS Billing Dashboard (React + Node)", "rating": 5.0,
             "period_label": "Mar 2026 - May 2026", "amount_label": "95 hrs @ $17.00/hr",
             "feedback": "Delivered every milestone early. The dashboard is exactly what we envisioned."},
            {"title": "Invoice Management System Optimization", "rating": 5.0,
             "period_label": "Oct 2025 - Jan 2026", "amount_label": "Fixed-price $2,400.00",
             "feedback": "Great experience as always."},
        ],
    },
    {
        "id": "mf-4", "sort_order": 4,
        "name": "Andrew C.", "avatar_url": None,
        "title": "Full-Stack AI Developer | Supabase, Stripe, Voice Agents",
        "country": "United States", "city": "Austin", "hourly_rate": 75, "job_success_pct": 100,
        "badge": ETalentBadge.TOP_RATED_PLUS, "total_earned_label": "$70K+", "jobs_count": 31,
        "hours_worked": 1450, "available_now": True,
        "skills": ["React", "Supabase", "Stripe", "TypeScript", "Next.js", "AI Development", "OpenAI API"],
        "overview": (
            "I use React and Next.js to create responsive user interfaces for AI-driven apps with "
            "real-time data handling and dynamic content.\n\n"
            "Built and stabilized AI-powered web applications using React, Next.js, and TypeScript, "
            "ensuring production-ready performance. Deep experience with Supabase auth/storage and "
            "Stripe billing."
        ),
        "languages": ["English: Native"],
        "verifications": ["ID verified", "Phone verified"],
        "hours_per_week_label": "Less than 30 hrs/week", "member_since": "Aug 2022",
        "work_history": [
            {"title": "E-Commerce AI Chatbot (Next.js, Vercel AI SDK)", "rating": 5.0,
             "period_label": "Apr 2026 - Jun 2026", "amount_label": "Fixed-price $5,500.00",
             "feedback": "Thorough and prompt, stuck to timelines and was proactive and helpful."},
            {"title": "Voice Agent Prototype for Real-Estate CRM", "rating": 5.0,
             "period_label": "Jan 2026 - Mar 2026", "amount_label": "60 hrs @ $75.00/hr",
             "feedback": "Bleeding-edge work delivered like it was routine. Fantastic."},
            {"title": "Stripe Billing Integration & Migration", "rating": 4.9,
             "period_label": "Nov 2025 - Dec 2025", "amount_label": "Fixed-price $3,000.00",
             "feedback": "Handled a messy legacy billing setup with zero customer disruption."},
        ],
    },
    {
        "id": "mf-5", "sort_order": 5,
        "name": "Ramona A.", "avatar_url": None,
        "title": "React / Full Stack Developer / Technical PM",
        "country": "Lithuania", "city": "Vilnius", "hourly_rate": 35, "job_success_pct": 98,
        "badge": ETalentBadge.TOP_RATED, "total_earned_label": "$700K+", "jobs_count": 112,
        "hours_worked": 15300, "available_now": False,
        "skills": ["CSS", "Front-End Development", "JavaScript", "React", "Web Design",
                   "Full-Stack Development", "Project Management"],
        "overview": (
            "Upgraded a React 16 codebase by addressing critical vulnerabilities and optimizing security "
            "measures through proven methodologies.\n\n"
            "Built and delivered 100+ shipped projects as a React developer with a focus on fast-loading, "
            "scalable, and revenue-generating products. I also run delivery for small teams as a "
            "technical PM."
        ),
        "languages": ["English: Fluent", "Lithuanian: Native", "Russian: Fluent"],
        "verifications": ["ID verified"],
        "hours_per_week_label": "More than 30 hrs/week", "member_since": "May 2015",
        "work_history": [
            {"title": "React 16 → 18 Upgrade + Security Hardening", "rating": 5.0,
             "period_label": "Feb 2026 - May 2026", "amount_label": "180 hrs @ $35.00/hr",
             "feedback": "Handled a scary upgrade with a calm, methodical process. Zero regressions."},
            {"title": "Technical PM for 4-Person Frontend Team", "rating": 4.8,
             "period_label": "Sep 2025 - Jan 2026", "amount_label": "320 hrs @ $32.00/hr",
             "feedback": "Kept the team unblocked and the roadmap honest. Would hire again."},
        ],
    },
    {
        "id": "mf-6", "sort_order": 6,
        "name": "Yusuf M.", "avatar_url": None,
        "title": "React Developer | Frontend React | Node.js",
        "country": "Pakistan", "city": "Lahore", "hourly_rate": 15, "job_success_pct": 92,
        "badge": ETalentBadge.RISING_TALENT, "total_earned_label": "$10K+", "jobs_count": 13,
        "hours_worked": 890, "available_now": True,
        "skills": ["CSS", "Front-End Development", "React", "Node.js", "JavaScript", "Bootstrap"],
        "overview": (
            "Migrated WordPress sites to React applications while optimizing speed and enhancing user "
            "experience through modern implementations.\n\n"
            "Built and scaled 50+ React applications across multiple industries with production-ready "
            "performance."
        ),
        "languages": ["English: Conversational", "Urdu: Native"],
        "verifications": ["ID verified"],
        "hours_per_week_label": "More than 30 hrs/week", "member_since": "Dec 2024",
        "work_history": [
            {"title": "WordPress → React Migration", "rating": 5.0,
             "period_label": "Apr 2026 - May 2026", "amount_label": "Fixed-price $1,200.00",
             "feedback": "Fast, responsive, and the new site is dramatically quicker."},
            {"title": "Landing Page Build from Figma", "rating": 4.5,
             "period_label": "Feb 2026 - Mar 2026", "amount_label": "Fixed-price $400.00",
             "feedback": "Good work overall; needed one revision round on mobile spacing."},
        ],
    },
    {
        "id": "mf-7", "sort_order": 7,
        "name": "Elena V.", "avatar_url": None,
        "title": "Senior Product Designer | UI/UX | Design Systems",
        "country": "Spain", "city": "Valencia", "hourly_rate": 55, "job_success_pct": 99,
        "badge": ETalentBadge.TOP_RATED, "total_earned_label": "$300K+", "jobs_count": 76,
        "hours_worked": 7100, "available_now": False,
        "skills": ["UI/UX Design", "Figma", "Design Systems", "Web Design", "Brand Identity", "Prototyping"],
        "overview": (
            "Product designer with 9 years of experience across fintech, SaaS, and e-commerce.\n\n"
            "I design end-to-end: research, flows, high-fidelity UI, and the design system to keep it "
            "consistent. My work reads clean and editorial — hierarchy first, decoration last."
        ),
        "languages": ["English: Fluent", "Spanish: Native"],
        "verifications": ["ID verified", "Phone verified"],
        "hours_per_week_label": "Less than 30 hrs/week", "member_since": "Jul 2017",
        "work_history": [
            {"title": "Fintech Brand + Landing Page Design", "rating": 5.0,
             "period_label": "Mar 2026 - May 2026", "amount_label": "Fixed-price $4,800.00",
             "feedback": "Elena's work is on another level. Investors specifically complimented the deck and site."},
            {"title": "Design System for B2B SaaS", "rating": 5.0,
             "period_label": "Nov 2025 - Feb 2026", "amount_label": "160 hrs @ $55.00/hr",
             "feedback": "Organized, opinionated in the best way, and fast."},
            {"title": "Mobile App UX Overhaul", "rating": 4.9,
             "period_label": "Jul 2025 - Oct 2025", "amount_label": "120 hrs @ $50.00/hr",
             "feedback": "Retention improved measurably after the redesign shipped."},
        ],
    },
    {
        "id": "mf-8", "sort_order": 8,
        "name": "Daniel K.", "avatar_url": None,
        "title": "Data Scientist | Python | SQL | Analytics Engineering",
        "country": "Kenya", "city": "Nairobi", "hourly_rate": 45, "job_success_pct": 96,
        "badge": None, "total_earned_label": "$60K+", "jobs_count": 27,
        "hours_worked": 2300, "available_now": True,
        "skills": ["Python", "SQL", "Data Analysis", "BigQuery", "dbt", "Machine Learning", "Looker Studio"],
        "overview": (
            "Data scientist and analytics engineer. I turn messy warehouses into trustworthy metrics "
            "layers and dashboards people actually use.\n\n"
            "Recent projects: marketing attribution modeling in BigQuery + dbt, churn prediction for a "
            "subscription business, and executive dashboards in Looker Studio."
        ),
        "languages": ["English: Fluent", "Swahili: Native"],
        "verifications": ["ID verified"],
        "hours_per_week_label": "As needed - open to offers", "member_since": "Apr 2021",
        "work_history": [
            {"title": "Marketing Attribution Model (BigQuery + dbt)", "rating": 5.0,
             "period_label": "Apr 2026 - Jun 2026", "amount_label": "90 hrs @ $45.00/hr",
             "feedback": "Clear thinker. The attribution model settled a year-long internal debate."},
            {"title": "Churn Prediction for Subscription App", "rating": 4.7,
             "period_label": "Dec 2025 - Feb 2026", "amount_label": "Fixed-price $3,600.00",
             "feedback": "Solid modeling work and an honest write-up of its limits."},
        ],
    },
]


async def seed_marketplace(session: AsyncSession) -> None:
    """Insert the catalog if empty. Idempotent: no-op when jobs already exist."""
    existing = (await session.execute(select(func.count()).select_from(MarketplaceJob))).scalar()
    if existing:
        return
    session.add_all([MarketplaceJob(**row) for row in MARKETPLACE_JOBS])
    session.add_all([Freelancer(**row) for row in FREELANCERS])
    await session.commit()
