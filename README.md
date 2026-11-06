# One2X 电通大会报告：极小部署入口

本仓库保存部署配置、无依赖 Node.js 构建脚本及小型页面更新。完整报告、原始媒体的无损分段与校验清单均已先上传公开GitHub源码仓库：

https://github.com/arthen97/one2x-dentsu-film-report

固定源码提交：130eda427a9edceef22e7e5377ce2f9d924edc7b
固定源码树：b4a46519f87bac08368daad1114ea527bdd7892f

Menv 配置为 build.shape=static、build.root=.、build.output=dist。使用Node.js 22或更新版本，构建命令 npm run build，无第三方依赖。

默认构建从GitHub codeload的固定提交流式下载tar.gz，直接送tar解包，不保存大压缩包；去掉codeload外层目录。临时源码放在dist之外。随后执行原源码的scripts/build.mjs及scripts/verify-assets.mjs，逐片校验、流式解压拼接并验证全部逻辑文件的SHA256，最后将完整输出移动到本仓库dist/，清理临时源码。发布入口为dist/index.html。

本地离线验证可设置环境变量ONE2X_SOURCE_ARCHIVE为完整源码归档绝对路径，再运行npm run build。该归档无外层目录，使用strip-components=0；默认远程codeload使用strip-components=1。环境变量不写入Menv配置，线上仍使用固定GitHub提交。

基础版本有323文件，含45个视频、192张图片、2个字体。原媒体继续完整保存在公开源码仓库中。

当前 KAIROS 脚本更新位于 overlay/，overlay-manifest.json 逐文件声明路径、大小和 SHA256。构建先还原基础版本，再校验并应用更新，保留所有未修改文件；最后重新校验全部输出，写入 dist/release-manifest.json。当前共329个内容文件，另有发布清单，含45个视频、193张图片和2个字体。新增图片为当前v6预演画面，原45视频及192图片原字节不变。

当前脚本依据 ae-native-v6/index.html 及实际AE总合成排时：60秒、7个主叙事段，保留日语与中文原文。主页入口更新，旧KAIROS页与references-28.html原路径及锚点保留并提示当前稿。影片MP4及AE工程不作为本次脚本更新附件新增。

dist、临时源码、node_modules均不提交Git。仍部署到同一个Menv应用和原域名，不新建站点。
