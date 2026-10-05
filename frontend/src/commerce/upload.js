import { client } from '../auth/client';
export async function uploadProductImage(shop,file){
  if(!client)throw new Error('Supabase chưa được cấu hình.');
  if(file.size>5242880||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB.');
  const {data,error}=await client.auth.getSession();if(error||!data.session)throw new Error('Vui lòng đăng nhập.');
  const response=await fetch(`/api/v1/seller/shops/${shop}/images`,{method:'POST',credentials:'omit',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':file.type},body:file});
  const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'Không tải được ảnh.');return result.url;
}
