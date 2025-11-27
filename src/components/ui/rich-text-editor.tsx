import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Heading2,
  Undo,
  Redo
} from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  error?: string;
}

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = "輸入內容...",
  className,
  error 
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none min-h-[200px] px-3 py-2 focus:outline-none',
          error && 'border-destructive'
        ),
      },
    },
  });

  if (!editor) {
    return null;
  }

  const MenuButton = ({ 
    onClick, 
    isActive, 
    icon: Icon,
    title 
  }: { 
    onClick: () => void; 
    isActive?: boolean; 
    icon: any;
    title: string;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        'h-8 w-8 p-0',
        isActive && 'bg-muted'
      )}
      title={title}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );

  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn(
        'border rounded-md overflow-hidden',
        error && 'border-destructive'
      )}>
        <div className="flex items-center gap-1 p-2 border-b bg-muted/30">
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            icon={Bold}
            title="粗體"
          />
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            icon={Italic}
            title="斜體"
          />
          <div className="w-px h-6 bg-border mx-1" />
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            icon={Heading2}
            title="標題"
          />
          <div className="w-px h-6 bg-border mx-1" />
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            icon={List}
            title="項目符號"
          />
          <MenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            icon={ListOrdered}
            title="編號清單"
          />
          <div className="w-px h-6 bg-border mx-1" />
          <MenuButton
            onClick={() => editor.chain().focus().undo().run()}
            icon={Undo}
            title="復原"
          />
          <MenuButton
            onClick={() => editor.chain().focus().redo().run()}
            icon={Redo}
            title="重做"
          />
        </div>
        <EditorContent editor={editor} />
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
