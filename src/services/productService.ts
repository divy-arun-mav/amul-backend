import axios from 'axios';
import { Product } from '@/models/Product';
import { AmulProductData } from '@/types';
import { notifySubscribers } from './emailService';

const AMUL_API_URL =
  "https://shop.amul.com/api/1/entity/ms.products?fields[name]=1&fields[brand]=1&fields[categories]=1&fields[collections]=1&fields[alias]=1&fields[sku]=1&fields[price]=1&fields[compare_price]=1&fields[original_price]=1&fields[images]=1&fields[metafields]=1&fields[discounts]=1&fields[catalog_only]=1&fields[is_catalog]=1&fields[seller]=1&fields[available]=1&fields[inventory_quantity]=1&fields[net_quantity]=1&fields[num_reviews]=1&fields[avg_rating]=1&fields[inventory_low_stock_quantity]=1&fields[inventory_allow_out_of_stock]=1&fields[default_variant]=1&fields[variants]=1&fields[lp_seller_ids]=1&filters[0][field]=categories&filters[0][value][0]=protein&filters[0][operator]=in&filters[0][original]=1&facets=true&facetgroup=default_category_facet&limit=24&total=1&start=0&cdc=1m&substore=66505ff0998183e1b1935c75";

export const fetchAndUpdateProducts = async (): Promise<void> => {
  try {
    console.log('🔄 Fetching products from Amul API...');
    const response = await axios.get<{data: AmulProductData[]}>(AMUL_API_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "application/json, text/plain, */*",
        Referer: "https://shop.amul.com/",
        Origin: "https://shop.amul.com",
        "X-Requested-With": "XMLHttpRequest",
        Cookie:
          "_gid=GA1.2.1099355157.1749873983; _ga=GA1.1.1288130571.1749873983; _ga_1DPYKST0SD=GS2.2.s1749873983$o1$g1$t1749874009$j34$l0$h0; jsessionid=s%3AGyEicVr3BjN0B%2BCfyaUxIehg.AkuJ1n3dZuec1c4mEjmlOtZlaTsNmkI%2FV49gAlE7S%2BU; _ga_3GLS3FV0YJ=GS2.1.s1749873983$o1$g1$t1749874014$j29$l0$h0; _fbp=fb.1.1749874016141.580155298695685992; _ga_E69VZ8HPCN=GS2.1.s1749876872$o2$g0$t1749876872$j60$l0$h560294298; __cf_bm=.3rrLX6ZlzJ3eizyGxUGF1Qj7VjZmns7QFcNAdpuMDE-1749889883-1.0.1.1-LkuhDdhMFND18O9nh1sVoOqavbN95nD2Le6jWI5zUrr_xCBdn6uLpr6T.qygivRPuBdrCTRbmhnMgQuo9gnh0FcUpyQgevGunLLQUKOFfyQ",
      },
    });    

    const products: AmulProductData[] = response.data.data;
    console.log(products.length);

    let updatedCount = 0;
    let addedCount = 0;
    let restockedCount = 0;

    for (const productData of products) {
      const existingProduct = await Product.findOne({
        productId: productData._id,
      });
      
      if (existingProduct) {
        const wasOutOfStock = existingProduct.inventoryQuantity === 0;
        const nowInStock = productData.inventory_quantity > 0;
        
        if (wasOutOfStock && nowInStock) {
          console.log(`📦 Product ${productData.name} is back in stock!`);
          await notifySubscribers(existingProduct, productData);
          restockedCount++;
        }
        
        await Product.findOneAndUpdate(
          { productId: productData._id },
          {
            inventoryQuantity: productData.inventory_quantity,
            lastChecked: new Date(),
            wasOutOfStock: productData.inventory_quantity === 0,
            price: productData.price,
            name: productData.name,
            isActive: true
          }
        );
        updatedCount++;
      } else {
        const newProduct = new Product({
          productId: productData._id,
          name: productData.name,
          alias: productData.alias,
          price: productData.price,
          inventoryQuantity: productData.inventory_quantity,
          image: productData.images && productData.images.length > 0 ? 
                `https://shop.amul.com/s/62fa94df8c13af2e242eba16/${productData.images[0].image}` : undefined,
          brand: productData.brand,
          wasOutOfStock: productData.inventory_quantity === 0,
          isActive: true
        });
        await newProduct.save();
        addedCount++;
        console.log(`➕ Added new product: ${productData.name}`);
      }
    }
    
    console.log(`✅ Products sync completed - Updated: ${updatedCount}, Added: ${addedCount}, Restocked: ${restockedCount}`);
  } catch (error) {
    console.error('❌ Error fetching products:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
};