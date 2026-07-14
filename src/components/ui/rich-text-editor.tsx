import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { useEffect, useState } from 'react';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Heading2,
  Undo,
  Redo,
  Palette,
  Check
} from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './popover';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  error?: string;
}

// 預設顏色選項
const TEXT_COLORS = [
  { name: '預設', color: null },
  { name: '黑色', color: '#000000' },
  { name: '深灰', color: '#4B5563' },
  { name: '紅色', color: '#DC2626' },
  { name: '橘色', color: '#EA580C' },
  { name: '琥珀', color: '#D97706' },
  { name: '綠色', color: '#16A34A' },
  { name: '藍色', color: '#2563EB' },
  { name: '紫色', color: '#9333EA' },
  { name: '粉紅', color: '#DB2777' },
];

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = "輸入內容...",
  className,
  error 
}: RichTextEditorProps) {
  const [colorOpen, setColorOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit as any,
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder,
      }),
    ] as any,
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

  // 當 value prop 改變時更新編輯器內容
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

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
        'h-11 w-11 sm:h-8 sm:w-8 p-0 touch-manipulation',
        isActive && 'bg-muted'
      )}
      title={title}
    >
      <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
    </Button>
  );

  const getCurrentColor = () => {
    return editor.getAttributes('textStyle').color || null;
  };

  const handleColorSelect = (color: string | null) => {
    if (color === null) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setColorOpen(false);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn(
        'border rounded-md overflow-hidden',
        error && 'border-destructive'
      )}>
        <div className="flex items-center gap-1 p-2 border-b bg-muted/30 flex-wrap">
          <MenuButton
            onClick={() => (editor.chain().focus() as any).toggleBold().run()}
            isActive={editor.isActive('bold')}
            icon={Bold}
            title="粗體"
          />
          <MenuButton
            onClick={() => (editor.chain().focus() as any).toggleItalic().run()}
            isActive={editor.isActive('italic')}
            icon={Italic}
            title="斜體"
          />
          <div className="w-px h-6 bg-border mx-1" />
          <MenuButton
            onClick={() => (editor.chain().focus() as any).toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            icon={Heading2}
            title="標題"
          />
          <div className="w-px h-6 bg-border mx-1" />
          
          {/* 文字顏色選擇器 */}
          <Popover open={colorOpen} onOpenChange={setColorOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-11 w-11 sm:h-8 sm:w-8 p-0 touch-manipulation relative',
                  getCurrentColor() && 'bg-muted'
                )}
                title="文字顏色"
              >
                <Palette className="h-5 w-5 sm:h-4 sm:w-4" />
                {getCurrentColor() && (
                  <div 
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full"
                    style={{ backgroundColor: getCurrentColor() }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 bg-popover" align="start">
              <div className="grid grid-cols-5 gap-2">
                {TEXT_COLORS.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => handleColorSelect(item.color)}
                    className={cn(
                      'w-8 h-8 rounded-md border-2 flex items-center justify-center transition-all hover:scale-110',
                      getCurrentColor() === item.color 
                        ? 'border-primary ring-2 ring-primary/20' 
                        : 'border-border hover:border-primary/50'
                    )}
                    style={{ 
                      backgroundColor: item.color || 'transparent',
                    }}
                    title={item.name}
                  >
                    {item.color === null && (
                      <span className="text-xs text-muted-foreground">A</span>
                    )}
                    {getCurrentColor() === item.color && item.color && (
                      <Check className="h-4 w-4 text-white drop-shadow-md" />
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                選擇文字顏色
              </p>
            </PopoverContent>
          </Popover>

          <div className="w-px h-6 bg-border mx-1" />
          <MenuButton
            onClick={() => (editor.chain().focus() as any).toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            icon={List}
            title="項目符號"
          />
          <MenuButton
            onClick={() => (editor.chain().focus() as any).toggleOrderedList().run()}
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
