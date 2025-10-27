import { defaultTemplates } from './templates';
import { QuestionTemplate, QuestionType } from '../types';

const STORAGE_KEY = 'qa_templates';

/**
 * Load all templates from localStorage with fallback to defaults
 */
export const getTemplates = (): QuestionTemplate[] => {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (error) {
		console.error('Error loading templates from localStorage:', error);
	}
	return defaultTemplates;
};

/**
 * Save templates to localStorage
 */
export const saveTemplates = (templates: QuestionTemplate[]): void => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
	} catch (error) {
		console.error('Error saving templates to localStorage:', error);
	}
};

/**
 * Get templates filtered by question type
 */
export const getTemplatesByType = (type: QuestionType): QuestionTemplate[] => {
	const templates = getTemplates();
	return templates.filter((t) => t.questionType === type);
};

/**
 * Get a specific template by ID
 */
export const getTemplateById = (id: string): QuestionTemplate | undefined => {
	const templates = getTemplates();
	return templates.find((t) => t.id === id);
};

/**
 * Get the active template for a question type
 */
export const getActiveTemplate = (type: QuestionType): QuestionTemplate => {
	const templates = getTemplatesByType(type);
	// Prefer non-default templates if available
	const customTemplate = templates.find((t) => !t.isDefault);
	return customTemplate || templates[0] || defaultTemplates[0];
};

/**
 * Add a new template
 */
export const addTemplate = (template: QuestionTemplate): void => {
	const templates = getTemplates();
	templates.push(template);
	saveTemplates(templates);
};

/**
 * Update an existing template
 */
export const updateTemplate = (
	id: string,
	updates: Partial<QuestionTemplate>
): void => {
	const templates = getTemplates();
	const index = templates.findIndex((t) => t.id === id);
	if (index !== -1) {
		templates[index] = { ...templates[index], ...updates };
		saveTemplates(templates);
	}
};

/**
 * Delete a template (cannot delete default templates)
 */
export const deleteTemplate = (id: string): void => {
	const templates = getTemplates();
	const template = templates.find((t) => t.id === id);
	if (template?.isDefault) {
		throw new Error('Cannot delete default templates');
	}
	const updatedTemplates = templates.filter((t) => t.id !== id);
	saveTemplates(updatedTemplates);
};

/**
 * Set the active template for a question type
 */
export const setActiveTemplate = (
	type: QuestionType,
	templateId: string
): void => {
	const templates = getTemplates();
	// Remove active status from other templates of this type
	templates.forEach((t) => {
		if (t.questionType === type) {
			delete t.isDefault; // Remove isDefault flag
		}
	});
	saveTemplates(templates);
};
