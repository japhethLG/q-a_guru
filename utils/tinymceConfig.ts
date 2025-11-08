/**
 * Shared TinyMCE configuration constants
 * Used across all TinyMCE editor instances in the application
 */

// Comprehensive list of all free TinyMCE plugins
export const TINYMCE_PLUGINS: string[] = [
	// Core formatting plugins
	'advlist',
	'autolink',
	'lists',
	'link',
	'image',
	'charmap',
	'preview',
	'anchor',
	'searchreplace',
	'visualblocks',
	'code',
	'fullscreen',
	'insertdatetime',
	'media',
	'table',
	'help',
	'wordcount',
	// Additional free plugins
	'quickbars',
	'emoticons',
	'template',
	'pagebreak',
	'nonbreaking',
	'directionality',
	'visualchars',
	'noneditable',
	'hr',
	'print',
	'save',
	'spellchecker',
	'toc',
	'footnotes',
	'accordion',
	'formatpainter',
];

// Clean, organized toolbar without duplicates
export const TINYMCE_TOOLBAR =
	'undo redo | formatselect | bold italic underline strikethrough | forecolor backcolor | ' +
	'alignleft aligncenter alignright alignjustify | bullist numlist | outdent indent | ' +
	'link image media table | blockquote code | searchreplace formatpainter removeformat | ' +
	'fullscreen preview help';

// Quickbars configuration - most used actions for context menus
export const TINYMCE_QUICKBARS_SELECTION_TOOLBAR =
	'bold italic | quicklink blockquote | forecolor backcolor';
export const TINYMCE_QUICKBARS_INSERT_TOOLBAR = 'quickimage quicktable | hr pagebreak';

