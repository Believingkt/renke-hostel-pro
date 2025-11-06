import ogImage1 from "@/assets/og-image-1.jpg";
import ogImage2 from "@/assets/og-image-2.jpg";
import ogImage3 from "@/assets/og-image-3.jpg";

const OgImagePreview = () => {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">社交媒體分享圖片預覽</h1>
        
        <div className="space-y-8">
          <div className="border rounded-lg overflow-hidden shadow-lg">
            <img src={ogImage1} alt="分享圖片 1 - 現代極簡風格" className="w-full" />
            <p className="p-4 text-center font-medium">圖片 1：現代極簡風格</p>
          </div>

          <div className="border rounded-lg overflow-hidden shadow-lg">
            <img src={ogImage2} alt="分享圖片 2 - 傳統東方風格" className="w-full" />
            <p className="p-4 text-center font-medium">圖片 2：傳統東方風格</p>
          </div>

          <div className="border rounded-lg overflow-hidden shadow-lg">
            <img src={ogImage3} alt="分享圖片 3 - 奢華現代風格" className="w-full" />
            <p className="p-4 text-center font-medium">圖片 3：奢華現代風格</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OgImagePreview;
