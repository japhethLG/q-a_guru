# Q&A Guru

<div align="center">
<img width="1200" height="475" alt="Q&A Guru Banner" src="./docs/images/banner.png" />
</div>

An AI-powered Q&A Generator and Document Editor that transforms your documents into interactive learning materials. Built with React, TypeScript, and Google's Gemini AI.

## Features

### 📄 Document Processing

- **Multi-format Support**: Upload and parse PDF, DOCX, PPTX, and TXT files
- **Smart Parsing**: Extracts text content from complex document structures
- **Batch Upload**: Process multiple documents simultaneously

### 🤖 AI-Powered Generation

- **Flexible Question Types**: Multiple choice, true/false, short answer, essay, or mixed
- **Customizable Templates**: Create and manage custom output templates with variables
- **Difficulty Levels**: Generate questions at easy, medium, or hard difficulty levels
- **Advanced Prompting**: Add custom instructions for specialized content
- **Multiple AI Models**: Choose from Gemini 2.5 Pro, Flash, or Flash Lite

### ✏️ Rich Text Editor

- **Full-featured Editor**: Based on Quill with comprehensive formatting options
- **Version History**: Track all document versions with timestamps and reasons
- **Preview Mode**: View any past version without losing your current work
- **Undo/Redo Support**: Built-in revision management
- **Auto-save**: Keyboard shortcuts (Ctrl+S/Cmd+S) to save versions

### 💬 AI Assistant Chat

- **Contextual Editing**: Select text and ask the AI to improve, summarize, or fix it
- **Document Editing**: AI can directly edit documents using function calls
- **Source-aware**: Chat assistant has access to your uploaded documents
- **Real-time Streaming**: Watch responses stream in real-time
- **Multi-model Support**: Choose different AI models for chat vs generation

### 📥 Export Options

- **PDF Export**: Generate professional PDFs with proper formatting
- **Word Documents**: Export as .DOCX files
- **Markdown**: Export as .md files
- **Plain Text**: Export as .txt files

### 🎨 Modern UI

- **Dark Theme**: Beautiful gray-800 theme with cyan-400 accents
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Collapsible Sections**: Organize interface elements efficiently
- **Common Components**: Consistent UI components throughout

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository:

```bash
git clone https://github.com/japhethLG/q-a_guru.git
cd q-a_guru
```

2. Install dependencies:

```bash
npm install
```

3. Configure your Gemini API key:

   Create a `.env` file in the root directory:

   ```env
   VITE_GEMINI_API_KEY=your-api-key-here
   ```

   Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

4. Run the development server:

```bash
npm run dev
```

5. Open your browser to `http://localhost:3000`

## Usage

### Basic Workflow

1. **Upload Documents**: Drag and drop or click to upload PDF, DOCX, PPTX, or TXT files
2. **Configure Settings**: Choose question type, count, difficulty, and model
3. **Generate Q&A**: Click "Generate Q&A" and watch as questions stream in
4. **Edit & Refine**: Use the rich text editor to modify content
5. **Chat with AI**: Select text and ask the AI to improve, summarize, or fix grammar
6. **Export**: Download your document as PDF, DOCX, Markdown, or TXT

### Advanced Features

#### Custom Templates

Create custom question templates with variables:

- `[number]` - Question number
- `[question]` - The question text
- `[answer]` - The correct answer
- `[reference]` - Source reference
- And more...

Access the template manager via the settings icon in the "Output Template" section.

#### Version History

Every generation and major edit creates a new version. Access version history via the dropdown in the editor toolbar:

- **Preview**: View any past version
- **Revert**: Go back to a previous version
- **Delete**: Remove unwanted versions

#### AI Chat Features

- **Improve**: Enhance selected text quality
- **Fix Grammar**: Correct spelling and grammar
- **Summarize**: Condense selected content
- **Custom Prompts**: Ask anything about your documents

## Tech Stack

### Frontend

- **React 19**: Latest React with modern hooks
- **TypeScript**: Type-safe development
- **Tailwind CSS 4**: Modern utility-first styling
- **Quill**: Rich text editor
- **Vite**: Fast build tool and dev server

### Libraries

- **@google/genai**: Google's Gemini AI integration
- **mammoth**: DOCX parsing
- **pdfjs-dist**: PDF parsing
- **jszip**: PPTX parsing
- **quill-to-word**: DOCX export
- **html2pdf.js**: PDF generation
- **turndown**: HTML to Markdown conversion
- **file-saver**: File downloads

## Project Structure

```
q-a_guru/
├── components/
│   ├── common/          # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Textarea.tsx
│   │   ├── Dropdown.tsx
│   │   ├── Modal.tsx
│   │   └── ...
│   ├── ChatSection.tsx  # AI chat interface
│   ├── ConfigSection.tsx # Generation settings
│   ├── EditorSection.tsx # Rich text editor
│   ├── FileUploadSection.tsx
│   ├── QAGenerator.tsx  # Main component
│   └── ...
├── services/
│   ├── gemini.ts        # AI integration
│   ├── parser.ts        # Document parsing
│   ├── prompts.ts       # AI prompts
│   ├── templates.ts     # Question templates
│   └── templateStorage.ts # Template persistence
├── types.ts             # TypeScript definitions
├── App.tsx              # Root component
└── index.tsx            # Entry point
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run preview` - Preview production build

### Code Standards

- **Components**: All UI elements use common components from `components/common/`
- **Never use raw HTML**: Always use Button, Input, Select, Textarea, etc.
- **TypeScript**: Full type safety throughout
- **Tailwind CSS**: Utility-first styling with custom color scheme

## Deployment

The app is configured for GitHub Pages deployment. The `gh-pages` branch contains the built files.

**Deployed at**: https://japhethLG.github.io/q-a_guru/
